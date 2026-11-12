'use strict';
const path=require('node:path'),os=require('node:os');
function claudeSDKDirectory(){return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local/share'),'RelayWorkbench','claude-sdk');}
function resolveClaudeSDK(){
 try{return require.resolve('@anthropic-ai/claude-agent-sdk/core',{paths:[claudeSDKDirectory()]});}
 catch{throw Error('חיבור Claude דורש התקנה נפרדת של ה־SDK הרשמי. הרץ npm run setup:claude מתיקיית המקור. ה־SDK כפוף לתנאי Anthropic ואינו נכלל בהפצת הקוד הפתוח.');}
}
module.exports={claudeSDKDirectory,resolveClaudeSDK};
