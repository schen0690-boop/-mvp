import { initializeConfiguredDatabase } from './runtime.js';

try {
  await initializeConfiguredDatabase();
  console.log('数据库初始化完成；已有数据保持不变。');
} catch {
  console.error('数据库初始化失败，请检查本地路径权限和运行环境。');
  process.exitCode = 1;
}
