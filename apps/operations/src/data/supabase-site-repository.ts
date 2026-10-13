import type { SupabaseClient } from "@supabase/supabase-js";
import type { Site, SiteDraft, SiteStatus, AttemptStatus } from "@/domain/model";
import type { SiteRepository } from "./site-repository";

const siteStatuses: Record<string,SiteStatus> = {unassigned:"Unassigned",assigned:"Assigned",in_progress:"In Progress",under_review:"Under Review",verified:"Verified",revisit_required:"Revisit Required",flagged_exception:"Flagged / Exception",closed_cancelled:"Closed / Cancelled"};
const attemptStatuses: Record<string,AttemptStatus> = {not_started:"Not started",in_progress:"In progress",submitted:"Submitted",accepted:"Accepted",rejected:"Rejected"};

export class SupabaseSiteRepository implements SiteRepository {
  constructor(private readonly client: SupabaseClient) {}
  async list(): Promise<Site[]> {
    const { data, error } = await this.client.from("sites").select("*, regions(name_en), cities(name_en), merchant_categories(name_en), visit_attempts(id,status,submitted_at,decided_at), audit_events(id,created_at,action,detail,actor_id)").order("site_code");
    if (error) throw error;
    return (data||[]).map((row:any)=>({id:row.site_code,merchant:row.merchant_name,region:row.regions.name_en,city:row.cities.name_en,category:row.merchant_categories.name_en,status:siteStatuses[row.status],driverId:row.assigned_driver_id,lat:Number(row.latitude),lng:Number(row.longitude),updatedAt:row.updated_at,address:row.address||undefined,attemptStatus:attemptStatuses[row.visit_attempts?.[0]?.status||"not_started"],visitAttempts:(row.visit_attempts||[]).map((attempt:any)=>({id:attempt.id,status:attemptStatuses[attempt.status],submittedAt:attempt.submitted_at||undefined,decidedAt:attempt.decided_at||undefined})),audit:(row.audit_events||[]).map((event:any)=>({id:event.id,at:event.created_at,actor:event.actor_id||"System",action:event.action,detail:event.detail||""}))} as Site));
  }
  async create(_draft: SiteDraft): Promise<Site> { throw new Error("Site creation requires reference IDs and will be enabled with the Phase 2 data switch."); }
  async assign(siteCodes:string[],driverId:string,reason="Assignment confirmed") { const {data,error}=await this.client.rpc("assign_sites",{p_site_codes:siteCodes,p_driver_id:driverId,p_reason:reason});if(error)throw error;return data?.[0]??{assigned:0,skipped:siteCodes.length}; }
  async decideReview(siteCode:string,decision:"verified"|"revisit_required"|"flagged_exception",reason:string,notes?:string) { const {data,error}=await this.client.rpc("decide_site_review",{p_site_code:siteCode,p_decision:decision,p_reason_code:reason,p_notes:notes||null});if(error)throw error;return data as string; }
}
