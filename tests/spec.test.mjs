import assert from "node:assert/strict";import {DGN_UI_SPEC as S} from "../dgn-ui-spec.js";
assert.equal(S.display.width,240);assert.equal(S.display.height,320);assert.equal(S.display.statusHeight+S.display.contentHeight+S.display.navHeight,320);
for(const r of Object.values(S.home)){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=240&&r.y+r.h<=264)}
assert.equal(S.source.commit.length,40);console.log("WebDGN spec OK");
