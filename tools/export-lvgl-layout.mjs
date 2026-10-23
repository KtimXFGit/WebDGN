import {DGN_UI_SPEC as S} from "../dgn-ui-spec.js";
import {mkdirSync,writeFileSync} from "node:fs";
const U=s=>s.replace(/([a-z0-9])([A-Z])/g,"$1_$2").replace(/[^A-Za-z0-9]+/g,"_").toUpperCase();
const lines=["#ifndef DGN_UI_LAYOUT_GENERATED_H","#define DGN_UI_LAYOUT_GENERATED_H","","/* Generated from WebDGN/dgn-ui-spec.js. Do not hand edit. */",`#define DGN_WEB_SOURCE_SHA "${S.source.commit}"`,`#define DGN_UI_HOR_RES ${S.display.width}`,`#define DGN_UI_VER_RES ${S.display.height}`,`#define DGN_UI_STATUS_H ${S.display.statusHeight}`,`#define DGN_UI_NAV_H ${S.display.navHeight}`,""];
for(const [group,items] of Object.entries({HOME:S.home,MEAS:S.measurement,TREND:{CHART:S.trend.chart},SET:S.settings})){for(const [name,r] of Object.entries(items)){if(!r||typeof r!=="object"||!("x" in r))continue;for(const k of["x","y","w","h"])if(r[k]!=null)lines.push(`#define DGN_UI_${group}_${U(name)}_${k.toUpperCase()} ${r[k]}`)}lines.push("")}
for(const [k,v] of Object.entries(S.palette))lines.push(`#define DGN_UI_COLOR_${U(k)} 0x${v.slice(1).toUpperCase()}UL`);
lines.push("","#endif");mkdirSync("generated",{recursive:true});writeFileSync("generated/dgn_ui_layout_generated.h",lines.join("\n")+"\n");console.log("generated/dgn_ui_layout_generated.h");
