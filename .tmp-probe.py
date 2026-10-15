import time
new_tab("http://localhost:3000/ztlive.html?bg=1")
wait_for_load()
time.sleep(2)
targets = cdp("Target.getTargets")["targetInfos"]
mine = [t for t in targets if t.get("type") == "page" and "ztlive.html" in (t.get("url") or "")]
for t in mine:
    cdp("Target.activateTarget", targetId=t["targetId"])
print("activated:", [t.get("url") for t in mine])
time.sleep(6)
print("visibility:", js("document.visibilityState"))
print("rows:", js("document.querySelectorAll('.el-table__body tbody tr').length"))
print("updated:", js("(document.querySelector('.embed-title-sub')||{innerText:''}).innerText"))