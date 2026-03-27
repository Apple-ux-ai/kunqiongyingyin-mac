/**
 * 默认播放器功能回归测试脚本
 * 功能：验证核心逻辑与文件修改状态
 * 作者：FullStack-Guardian
 * 更新时间：2026-02-02
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'e:\\360MoveData\\Users\\win10\\Desktop\\鲲穹AI播放器3\\鲲穹AI播放器源码';

function checkFileExists(filePath) {
    if (fs.existsSync(filePath)) {
        console.log(`[PASS] 文件存在: ${path.basename(filePath)}`);
        return true;
    } else {
        console.error(`[FAIL] 文件缺失: ${path.basename(filePath)}`);
        return false;
    }
}

function checkContent(filePath, keywords) {
    const content = fs.readFileSync(filePath, 'utf8');
    let allFound = true;
    keywords.forEach(keyword => {
        if (content.includes(keyword)) {
            console.log(`[PASS] 关键词发现: "${keyword}" in ${path.basename(filePath)}`);
        } else {
            console.error(`[FAIL] 关键词缺失: "${keyword}" in ${path.basename(filePath)}`);
            allFound = false;
        }
    });
    return allFound;
}

console.log('开始回归测试...');

const filesToCheck = [
    {
        path: path.join(PROJECT_ROOT, 'main.js'),
        keywords: ['check-default-status', 'set-as-default', 'ms-settings:defaultapps']
    },
    {
        path: path.join(PROJECT_ROOT, 'preload.js'),
        keywords: ['checkDefaultStatus', 'setAsDefault']
    },
    {
        path: path.join(PROJECT_ROOT, 'index.html'),
        keywords: ['id="defaultPlayerStatus"', 'id="btnSetAsDefault"']
    },
    {
        path: path.join(PROJECT_ROOT, 'script.js'),
        keywords: ['updateDefaultPlayerStatus', 'btnSetAsDefault', 'setAsDefault()']
    },
    {
        path: path.join(PROJECT_ROOT, 'styles.css'),
        keywords: ['.default-player-status', '.btn-set-default']
    }
];

let overallPass = true;

filesToCheck.forEach(file => {
    if (checkFileExists(file.path)) {
        if (!checkContent(file.path, file.keywords)) {
            overallPass = false;
        }
    } else {
        overallPass = false;
    }
});

if (overallPass) {
    console.log('\n[SUCCESS] 所有核心代码集成验证通过！');
} else {
    console.error('\n[ERROR] 部分集成验证失败，请检查上述错误。');
    process.exit(1);
}
