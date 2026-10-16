# 存档与坐标

原版存档编码：`base64(zlib(UTF-8 JSON))`。根对象包含 `DisplayName` 与 `Objects`。

节点 `type=0`：`id,x,y,anchorAID=0,anchorBID=0,splitForDrawBridge,rate`。固定锚点另有 `isKinematic=true`。构件通过 `anchorAID/anchorBID` 引用节点；自身 `x,y` 是两端中点。ID 必须全局唯一，保留基准存档锚点的 ID 与坐标。

材料编号：road=1，wood=2，steel=3，hydraulic=4，rope=5。此映射由原版游戏程序集的保存类型枚举核对，并由 3-13 液压设计实测。旧交接文档中 steel/rope 互换的映射错误，不应继续使用。常用单价（$/m）：road 200、wood 180、steel 450、hydraulic 750、rope 220；游戏对构件取整，汇总会与估算略有差异。

直接使用该关存档的原始坐标。不要应用旧 3-13 工具里的 `DX=6,DY=1.5` 转换，也不要将其他关卡锚点拷入当前关。生成节点不强制吸附 0.25 m 网格，因为实测斜坡含非网格节点。

传给 `--root` 的路径必须恰好是 `savefiles` 目录：

- 本地：`%USERPROFILE%/AppData/LocalLow/Dry Cactus/Poly Bridge/savefiles`
- Steam：`<Steam>/userdata/<账户>/367450/remote/savefiles`

2026-10-15 当前机器曾使用本地目录；旧工程使用 Steam。切勿把旧绝对路径作为所有机器的默认。`discover --steam <Steam目录>` 可补充 Steam 候选，但仍需游戏实际写入证据确认。

生成示例 spec：

```json
{
  "name": "two lower ramp trusses",
  "spans": [
    {"start": [0,0], "end": [8,2], "segments": 5, "depth": 1.5, "side": "below", "reinforceDeck": true},
    {"start": [12,2], "end": [20,5], "segments": 6, "depth": 1.5, "side": "below", "reinforceDeck": true}
  ],
  "supports": []
}
```

每跨的端点必须是基准固定锚点。路面等分，三角形第三点位于每段中点的上/下方，第三点连续连接为弦杆。`supports` 可指定额外木构件，如 `[[[5,-3],[5,-1.5]]]`。节点必须接入结构，路面/木材不超过 2 m，钢材/液压杆不超过 4 m；绳子的长度在当前静态校验器中不设上限，仍应检查游戏实际限制。此构造只保证拓扑和长度，不判断地形、船舶净空或承载力。

`check` 会拒绝 ID 重复、缺失端点、锚点变动、非有限坐标、重复构件、零长/超长构件、未授权材料，以及未连到固定锚点的活动组件。路面与同端点木材属于两种材料，可叠加。节点的道路连续性、预算和地形需进一步结合关卡检查。

液压 `rate` 是最终长度与初始长度之比：0.5 收缩 50%，1 保持，1.5 伸长 50%。不是正负位移；旧设计的 0 不能表示正常目标倍率。物理动作发生在关卡的液压阶段。

`check` 和 `plan` 的 `--allowed` 声明该关允许材料；`--limits limits.json` 声明数量上限，例如 `{"road":10,"steel":4,"rope":4}`，`-1` 表示不限制。预置设计会自动使用目录中记录的材料和数量约束。`build` 生成普通木桁架；3-13 的专用生成器见 [3-13-lift.md](3-13-lift.md)。
