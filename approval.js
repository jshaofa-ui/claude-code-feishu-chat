/**
 * 审批状态管理模块
 * 参考 Hermes gateway/platforms/feishu.py _approval_state 和 resolve_gateway_approval 实现
 */

// 审批状态存储 (approvalId -> { resolve, command, description })
const approvals = new Map();

// 审批计数器
let approvalCounter = 0;

/**
 * 创建一个新的审批请求
 * @param {string} command - 待执行的命令
 * @param {string} description - 操作说明
 * @returns {{ approvalId: number, command: string, description: string, promise: Promise }}
 */
function createApproval(command, description) {
  const approvalId = ++approvalCounter;

  let resolveFunc;
  const promise = new Promise((resolve) => {
    resolveFunc = resolve;
  });

  approvals.set(approvalId, {
    resolve: resolveFunc,
    command,
    description,
    createdAt: Date.now()
  });

  console.log(`[APPROVAL] 创建审批 #${approvalId}: ${description}`);

  return {
    approvalId,
    command,
    description,
    promise
  };
}

/**
 * 解析审批请求（用户点击按钮后调用）
 * @param {number} approvalId - 审批 ID
 * @param {string} choice - 用户选择: 'approve' 或 'deny'
 * @returns {boolean} 是否成功解析
 */
function resolveApproval(approvalId, choice) {
  const state = approvals.get(approvalId);
  if (!state) {
    console.log(`[APPROVAL] 未找到审批 #${approvalId}`);
    return false;
  }

  state.resolve(choice);
  approvals.delete(approvalId);

  console.log(`[APPROVAL] 解析审批 #${approvalId}: ${choice}`);
  return true;
}

/**
 * 等待审批结果（无限等待，不超时）
 * @param {number} approvalId - 审批 ID
 * @returns {Promise<string>} 用户选择: 'approve' 或 'deny'
 */
function waitForApproval(approvalId) {
  const state = approvals.get(approvalId);
  if (!state) {
    return Promise.resolve('deny');
  }

  // 无限等待，不设置超时
  return state.promise;
}

/**
 * 获取当前待处理的审批数量
 * @returns {number}
 */
function getPendingCount() {
  return approvals.size;
}

/**
 * 清理所有待处理的审批（服务重启时调用）
 */
function clearAll() {
  approvals.clear();
  console.log(`[APPROVAL] 清理所有待处理审批`);
}

module.exports = {
  createApproval,
  resolveApproval,
  waitForApproval,
  getPendingCount,
  clearAll
};