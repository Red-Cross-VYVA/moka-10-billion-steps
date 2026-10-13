import { describe,expect,it } from "vitest";
import { parseCsv,suggestMapping,validateImport } from "./site-import";

const headers=["site_id","merchant_name","region","city","category","latitude","longitude","address"];
const mapping=suggestMapping(headers);
describe("CSV import",()=>{
  it("parses quoted commas and escaped quotes",()=>{expect(parseCsv('id,name\n1,"Palm, \"\"Central\"\""')[1]).toEqual(["1",'Palm, "Central"'])});
  it("accepts valid records",()=>{const csv=headers.join(",")+'\nKSA-NEW,Palm Grocery,Riyadh,Riyadh,Grocery,24.7,46.6,Olaya';const result=validateImport(csv,mapping,[]);expect(result.accepted).toBe(1);expect(result.rejected).toBe(0)});
  it("rejects existing, in-file duplicate and malformed coordinate IDs",()=>{const csv=headers.join(",")+'\nKSA-OLD,A,Riyadh,Riyadh,Grocery,24,46,\nKSA-X,B,Riyadh,Riyadh,Grocery,nope,46,\nKSA-X,C,Riyadh,Riyadh,Grocery,24,46,';const result=validateImport(csv,mapping,["KSA-OLD"]);expect(result.accepted).toBe(0);expect(result.rejected).toBe(3);expect(result.rows[2].errors.join(" ")).toMatch(/Duplicate/)});
});
