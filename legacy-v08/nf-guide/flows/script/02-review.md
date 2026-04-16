# Step 2: 校验整体（Agent 干）

## CLI

```bash
nextframe script-get <project> <episode> --json     # 拿全部 segments
nextframe script-get <project> <episode> --segment N  # 拿单段
```

## 输入

写完的 pipeline.json 全部 script.segments

## 产出（gate: script-reviewed）

无文件产出，但若发现问题：用 `script-set` 修订对应段。

---

## 给 Agent 的提示词

你是脚本编辑。通读全文，找问题。

### 检查清单

1. **节奏**：长短句交替了吗？开头是不是钩子？结尾是不是落点？
2. **重复**：相邻段有没有重复信息？
3. **跳跃**：段与段之间有过渡吗？还是硬切？
4. **角色匹配**：每段的内容跟标的 role 一致吗？（标了"钩子"但实际像总结？）
5. **总时长合理**：按 4 字/秒粗算，全文字数 / 4 ≈ 总秒数。跟目标差太远要修
6. **可念性**：自己念一遍，有没有念不顺、绕口的地方？

### 修订方式

不重写整段，**精准用 script-set 替换**：

```bash
nextframe script-set <project> <episode> \
  --segment 3 \
  --narration "新文案" \
  --visual "新画面" \
  --role "原 role" \
  --logic "为什么这次改"
```

### 输出

打印一份 review report：

```markdown
## 校验结果

- 总字数：N → 估时 ~M 秒（目标 X 秒）
- 节奏：✓ / 段 N 太长 / ...
- 重复：段 2 和段 3 都讲了 XX，建议合并
- 修订建议：
  1. 段 N: 改 narration（已 script-set）
  2. 段 M: 改 role 标注

## 总评

OK / 需修订 / 建议重新 outline
```

不需要立刻执行所有修订，只把建议列出来给用户/下一个 agent 决策。
