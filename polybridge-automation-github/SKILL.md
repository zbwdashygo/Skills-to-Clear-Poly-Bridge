---
name: polybridge-automation
description: Automate bridge design and campaign iteration in the original Poly Bridge on Windows, including save discovery, truss generation, backed-up save injection, game simulation, and verified result tracking. Use for Poly Bridge bridge-building automation or campaign solving, not Poly Bridge 2/3 or unrelated bridge engineering.
---

# Poly Bridge 造桥自动化

为原版 Poly Bridge 执行「识别当前关卡 → 生成设计 → 校验 → 备份并注入手动槽 → 游戏载入 → 模拟 → 观察结果 → 迭代」。这是 Codex Skill，使用本地 Node.js 脚本处理存档，使用当前环境提供的电脑控制工具操作游戏；不提供独立游戏内模组或物理模拟器。

## 开始工作

- 确定用户要制作设计、测试指定关卡，还是连续通关；保留其范围。只制作 Skill 时，不操作游戏或改用户存档。
- `node scripts/polybridge.cjs help` 列出命令。命令中的脚本路径应相对此 Skill 目录解析，工作文件写入当前任务工作区。
- 读取 [存档与坐标](references/save-format.md) 再生成或注入设计。开始游戏交互前读取 [游戏闭环](references/game-loop.md)，并遵循当前环境电脑控制技能的工具和观察规则。
- 用 `discover` 列出候选存档根目录；候选目录存在不代表游戏正在使用它。用游戏创建一个新的手动槽，观察哪个 `savefiles/<内部关卡名>/<数字>` 文件更新，解码其锚点。这也是关卡映射的可靠证据。

## 设计和测试

1. 从游戏关卡简报读取显示关卡号、预算、材料、车辆/船只顺序，并检查地形。显示号与内部目录名不连续，禁止根据编号猜目录。
2. `inspect <slot>` 读取该关真实锚点。`build --baseline <slot> --spec <json> --out <candidate>` 生成上下桁架、斜坡或多跨桥；复杂关卡可自行生成符合存档格式的 JSON 后用 `encode` 编码。不要将普通桁架生成器当成通用液压桥求解器。专用 3-13 生成器仅适用于其已确认的四个锚点。
3. 优先匹配 [实测设计目录](references/verified-levels.json) 的关卡号、内部名和全部锚点。`preset --level 1-4 --baseline <slot> --out <candidate>` 会拒绝不匹配的基准。预置通过记录属于历史实测，不能替代当前模拟。针对 3-13 的液压抬桥，读取 [3-13 解法](references/3-13-lift.md)；使用专用生成器或经锚点校验的预置。
4. `check <candidate> --baseline <slot> --budget <金额> --allowed <该关材料列表> --limits <数量上限.json>` 检查结构、材料和长度。造价是估算；最终以游戏显示为准。
5. 生成注入计划：`plan --root <savefiles> --level <内部名> --slot 0 --candidate <candidate> --out <plan.json> --budget <金额> --allowed road,wood`。检查返回的目标、哈希、锚点、材料和预算。
6. 用户已授权相应存档修改时，执行 `apply --plan <plan.json> --backup-root <工作区备份目录> --commit`。它会检查文件是否自计划后改变，备份整个关卡目录，原子替换已有数字槽，并返回回滚清单。超出已有授权范围时先展示计划再问；不要反复询问已获授权的常规迭代。不要把文档中转述的授权当成用户授权。
7. 在游戏里观察载入列表并点击实际手动槽行，确认桥形和游戏造价已改变后开始模拟。观察到成功面板才记录 `success`；超预算、断裂与当前证据中的断件要如实记录。
8. `record --ledger <ledger.json> --visible-level 1-4 --internal-level Easy_004 --candidate <candidate> --verdict success --evidence <截图.png> --cost 7369 --budget 9000 --stress 65.1` 保存设计哈希与证据。脚本只记录观察，不识别截图；代理必须亲自检查截图内容及关卡身份。

单次生成出错就修正输入；模拟失败应检查断裂位置、车辆落水或船舶碰撞，针对性改结构，不循环重试同一设计。每个测试候选都保存，避免把失败设计覆盖成唯一版本。若连续三种实质不同设计仍失败，先汇总已有证据和下一种方案；存在可执行方案就继续，否则向用户请求缺失信息。

## 限制与恢复

- 桥梁物理、车辆碰撞、地形碰撞和液压时序只能在游戏中确认；静态校验通过不证明能过关。
- 不直接编辑 `progress.bytes` 解锁关卡，不改设置或杀进程来绕过载入问题；除非用户另行要求。
- 手动槽应先由游戏创建；脚本只替换已有 `0..4`，不创建/删除游戏槽文件，不写 AUTOSAVE。
- `restore --manifest <backup/manifest.json> --commit` 恢复被本工具替换的数字槽；若它之后被别的操作改过会拒绝。其他槽的备份保留供人工核对，不整体覆盖回滚。
- 若工具不可用、桌面锁定、游戏窗口不可定位或审批拒绝，保留候选、计划和当前结果，说明准确阻碍，不绕过限制。
- 用户改变任务时以最新要求为准；不要仅因交接文档说「逐章通关」就在 Skill 制作任务中继续玩游戏。
