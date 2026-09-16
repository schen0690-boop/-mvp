import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
export const stage6bSettings=Object.freeze({topic:'AI 如何改善教育？',expertCount:2,expertTurns:2,runDurationMs:120000,stopDurationMs:60000,callDurationMs:30000,totalRequests:20,ordinaryRequests:18,summaryRequests:2,model:'deepseek-flash',thinking:'disabled',stream:false,responseFormat:'json_object',tokenLimits:{assessIntent:512,generateUtterance:768,extractSynthesis:4096,summarize:1024}});
export const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
export const stage6bRoot=join(projectRoot,'.local/stage-6b-live');
export const stage6bAnchor=join(projectRoot,'.local/stage-6b-once.json');
export const presetRoster={roles:[
 {role:'moderator',name:'林知远（虚构）',profession:'教育议题主持',title:'圆桌主持人',stance:'澄清概念，要求意见回应已有发言，并区分实证与假设。'},
 {role:'expert',name:'陈思敏（虚构）',profession:'基础教育教学研究',title:'课堂实践研究员',stance:'关注教师工作负担、学习反馈和可评估的课堂效果，主张小范围试点。'},
 {role:'expert',name:'周衡（虚构）',profession:'教育公平与数据治理',title:'教育政策研究员',stance:'关注资源差异、学生隐私与偏差风险，要求说明弱势学生的参与条件。'}
]};
