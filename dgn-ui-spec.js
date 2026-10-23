export const DGN_UI_SPEC = {
  source: {
    repo: "KtimXFGit/DGN_01",
    branch: "main",
    commit: "291d4fb201a647f128c02f9e916b057a266e600a",
    syncedAt: "2026-10-23"
  },
  display: { width: 240, height: 320, statusHeight: 24, navHeight: 32, contentY: 24, contentHeight: 264 },
  palette: {
    bg:"#F3F7FC", bar:"#FFFFFF", panel:"#FFFFFF", panel2:"#E8F2FF",
    cyan:"#1677D2", blue:"#0B5CAD", green:"#1F8E5A", yellow:"#B87500",
    red:"#C73745", violet:"#5B67D6", text:"#17324D", muted:"#5E7892",
    grid:"#B8CCE5", off:"#9AAFC3"
  },
  typography: { body:14, title:16, digits:46 },
  home: {
    host:{x:6,y:4,w:111,h:74}, probe:{x:123,y:4,w:111,h:74},
    primary:{x:6,y:84,w:228,h:101}, total:{x:6,y:191,w:111,h:67},
    count:{x:123,y:191,w:111,h:67}
  },
  measurement: {
    primary:{x:8,y:6,w:224,h:112}, total:{x:8,y:124,w:224,h:50},
    count:{x:8,y:180,w:108,h:64}, detector:{x:124,y:180,w:108,h:64},
    doseBar:{x:10,y:91,w:204,h:8}
  },
  trend: { chart:{x:30,y:36,w:198,h:138}, statY:219, stateY:244, points:60, range:50 },
  settings: { titleX:20,titleY:4,track:{x:3,y:27,w:5,h:231}, rows:{x:20,y:27,w:212,h:36,gap:39,count:6} },
  nav: { labels:["设置","测量","趋势"], labelsEn:["SET","MEASURE","TREND"], widths:[80,80,80] }
};
