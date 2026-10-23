import assert from "node:assert/strict";import {DGN_UI_SPEC as S} from "../dgn-ui-spec.js";
assert.equal(S.display.width,240);assert.equal(S.display.height,320);assert.equal(S.display.statusHeight+S.display.contentHeight+S.display.navHeight,320);
for(const r of Object.values(S.home)){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=240&&r.y+r.h<=S.display.contentHeight)}
assert.ok(S.home.status&&S.home.logScale&&S.home.primary,'new home layout blocks missing');
assert.ok(S.home.primary.h>S.home.total.h,'primary dose card should be enlarged');
assert.ok(S.home.logScale.x<S.home.primary.x,'logarithmic range card must stay left of primary dose card');
assert.equal(S.home.count,undefined,'home count-rate card must stay removed');
assert.equal(S.home.total.w,228,'cumulative-dose card must span the content width');
assert.equal(S.display.navHeight,26,'bottom navigation must use compact 26px height');
assert.equal(S.source.commit.length,40);console.log("WebDGN spec OK");
