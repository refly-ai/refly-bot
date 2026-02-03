#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

// 获取脚本当前所在的目录，确保路径不依赖运行命令时的 CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = __dirname;

const REGISTRIES = {
  npm: 'https://registry.npmjs.org/',
  mirror: 'https://registry.npmmirror.com/'
};

async function checkNetwork(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: 2000 }, (res) => {
      resolve(Date.now() - start);
      res.resume();
    }).on('error', () => resolve(Infinity))
      .on('timeout', () => { req.destroy(); resolve(Infinity); });
  });
}

function getPackageManager() {
  // 优先尝试 pnpm
  try {
    execSync('pnpm -v', { stdio: 'ignore' });
    return 'pnpm';
  } catch (e) {
    try {
      execSync('yarn -v', { stdio: 'ignore' });
      return 'yarn';
    } catch (e) {
      return 'npm';
    }
  }
}

async function setup() {
  console.log('\n🚀 Refly Bot All-in-One Setup\n');

  // 1. 检查 package.json 是否存在
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error('❌ 错误: 找不到 package.json。请确保你在项目根目录下运行。');
    process.exit(1);
  }

  // 2. 选择镜像源
  console.log('🔍 正在检测网络环境以选择最快的下载源...');
  const npmLatency = await checkNetwork(REGISTRIES.npm);
  const mirrorLatency = await checkNetwork(REGISTRIES.mirror);

  let registry = REGISTRIES.npm;
  if (mirrorLatency < npmLatency || npmLatency === Infinity) {
    console.log('✅ 检测到官方源访问较慢，已自动切换至国内镜像 (npmmirror)。');
    registry = REGISTRIES.mirror;
  } else {
    console.log('✅ 官方源访问正常，使用默认 Registry。');
  }

  // 3. 选择包管理器
  const pm = getPackageManager();
  console.log(`🛠️  包管理器: ${pm}`);

  // 4. 安装依赖
  const nodeModulesPath = join(PROJECT_ROOT, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    console.log('✅ 依赖库已存在，跳过安装阶段。如需重装请删除 node_modules 目录。');
  } else {
    console.log(`📥 正在安装项目依赖...`);
    const installCmd = pm === 'yarn' ? 'install' : 'i';
    
    try {
      execSync(`${pm} ${installCmd} --registry=${registry}`, { 
        stdio: 'inherit', 
        shell: true,
        cwd: PROJECT_ROOT 
      });
      console.log('✅ 依赖安装成功！');
    } catch (error) {
      console.error(`❌ 依赖安装失败，请尝试手动运行: ${pm} install`);
      process.exit(1);
    }
  }

  // 5. 跨平台全局配置路径
  const homedir = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  const globalConfigDir = join(homedir, '.refly');
  const globalConfigPath = join(globalConfigDir, 'refly-bot.json');
  
  // 6. 核心配置加载逻辑 (优先级: 环境变量 > 全局配置 > 本地 .env)
  const DOC_LINK = 'https://powerformer.feishu.cn/wiki/YxMRwsQFriAMNukKr5Yc9OjMnnf';
  const REQUIRED_KEYS = ['APP_ID', 'APP_SECRET', 'REFLY_API_KEY'];
  
  const config = { ...process.env };

  // A. 加载全局配置 (~/.refly/refly-bot.json)
  if (existsSync(globalConfigPath)) {
    try {
      const globalData = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      Object.keys(globalData).forEach(key => {
        if (!config[key]) config[key] = globalData[key];
      });
    } catch (e) {
      console.warn('⚠️ 读取全局配置文件失败 (JSON 格式错误)');
    }
  }

  // B. 加载本地 .env (作为备选)
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!config[key]) config[key] = value;
      }
    });
  }

  const missingKeys = REQUIRED_KEYS.filter(key => {
    const val = config[key];
    return !val || val.includes('your_') || val.includes('_here') || val.trim() === '';
  });

  if (missingKeys.length > 0) {
    console.error('\n❌ 启动失败：缺少必要配置');
    console.error('-------------------------------------------');
    console.error(`缺少配置项: ${missingKeys.join(', ')}`);
    console.error(`\n你可以通过以下方式之一提供配置：\n`);
    console.error(`1. 命令行传入: APP_ID=xxx APP_SECRET=yyy ./run.sh`);
    console.error(`2. 全局配置文件: ${globalConfigPath}`);
    console.error(`\n详细指引请参考: \n👉 ${DOC_LINK}`);
    console.error('-------------------------------------------');
    process.exit(1);
  }

  // 将加载到的配置同步到 process.env，确保 index.js 能读取
  Object.keys(config).forEach(key => {
    process.env[key] = config[key];
  });

  console.log('\n✅ 配置检查通过，正在启动机器人...');
  
  // 动态导入主程序
  // 如果是作为包运行，index.js 会在同级目录
  await import('./index.js');
}

setup().catch(err => {
  console.error('💥 脚本运行出错:', err);
  process.exit(1);
});
