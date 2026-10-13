import { categories, regions } from "./fixtures";
import type { Category, Region, SiteDraft } from "../domain/model";
import { validateSiteDraft } from "../domain/model";

export const importFields = ["id","merchant","region","city","category","lat","lng","address"] as const;
export type ImportField = typeof importFields[number];
export type ColumnMapping = Partial<Record<ImportField,string>>;
export interface ImportPreviewRow { rowNumber:number; raw:Record<string,string>; draft?:SiteDraft; errors:string[] }
export interface ImportValidation { headers:string[]; rows:ImportPreviewRow[]; accepted:number; rejected:number }

export function parseCsv(text:string): string[][] {
  const rows:string[][]=[]; let row:string[]=[]; let field=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(char===','&&!quoted){row.push(field);field="";}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(value=>value.trim()))rows.push(row);row=[];field="";}
    else field+=char;
  }
  row.push(field); if(row.some(value=>value.trim()))rows.push(row);
  return rows;
}

export function suggestMapping(headers:string[]):ColumnMapping {
  const normalized=(value:string)=>value.trim().toLowerCase().replace(/[\s-]+/g,"_");
  const aliases:Record<ImportField,string[]>={id:["id","site_id","siteid"],merchant:["merchant","merchant_name","site_name","name"],region:["region"],city:["city"],category:["category","merchant_category"],lat:["lat","latitude"],lng:["lng","lon","long","longitude"],address:["address"]};
  return Object.fromEntries(importFields.map(field=>[field,headers.find(header=>aliases[field].includes(normalized(header)))||""])) as ColumnMapping;
}

export function validateImport(text:string,mapping:ColumnMapping,existingIds:Iterable<string>):ImportValidation {
  const parsed=parseCsv(text); const headers=(parsed[0]||[]).map(value=>value.trim());
  const mappedRequired:ImportField[]=["id","merchant","region","city","category","lat","lng"];
  const mappingErrors=mappedRequired.filter(field=>!mapping[field]);
  const existing=new Set([...existingIds].map(id=>id.toLowerCase())); const seen=new Set<string>();
  const rows=parsed.slice(1).map((values,index):ImportPreviewRow=>{
    const raw=Object.fromEntries(headers.map((header,column)=>[header,(values[column]||"").trim()])); const errors:string[]=[];
    if(mappingErrors.length){errors.push(`Map required fields: ${mappingErrors.join(", ")}`);return {rowNumber:index+2,raw,errors};}
    const value=(field:ImportField)=>raw[mapping[field]||""]||""; const id=value("id").trim();
    const draft:SiteDraft={id,merchant:value("merchant"),region:value("region") as Region,city:value("city"),category:value("category") as Category,lat:Number(value("lat")),lng:Number(value("lng")),address:value("address")||undefined};
    const fieldErrors=validateSiteDraft(draft,existing);
    Object.values(fieldErrors).forEach(error=>error&&errors.push(error));
    if(!value("lat").trim())errors.push("Latitude is required.");
    if(!value("lng").trim())errors.push("Longitude is required.");
    if(!regions.includes(draft.region))errors.push(`Unknown region: ${draft.region||"blank"}.`);
    if(!categories.includes(draft.category))errors.push(`Unknown category: ${draft.category||"blank"}.`);
    if(id&&seen.has(id.toLowerCase()))errors.push("Duplicate site ID within this file.");
    if(id)seen.add(id.toLowerCase());
    return {rowNumber:index+2,raw,draft,errors:[...new Set(errors)]};
  });
  return {headers,rows,accepted:rows.filter(row=>row.errors.length===0).length,rejected:rows.filter(row=>row.errors.length>0).length};
}
