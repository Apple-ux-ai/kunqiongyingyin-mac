# 实时登录监控优化计划

实施检查清单:
1. 修改 `login-manager.js`:
   - 优化 `checkLoginInterrupted(isFocusEvent)` 方法。
   - 增加 5 秒保护期逻辑（避免刚点击登录就切换回应用导致误判）。
   - 如果是 `focus` 事件且不在保护期内，立即执行 `stopPolling()` 和 `clearLoginState()`。
2. 修改 `script.js`:
   - 更新 `focus` 监听器，传递 `true` 参数给 `checkLoginInterrupted`。
   - 确保 `showLoginError` 能够覆盖所有中间状态。
3. 验证:
   - 点击登录后，立即切回应用（5秒内），不应报错。
   - 点击登录后，等待 5 秒以上切回应用，应立即显示“登录流程已中断”。
   - 验证 30 秒超时兜底逻辑依然有效。
o.
