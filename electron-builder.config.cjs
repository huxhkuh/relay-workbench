const path=require('node:path'),version=require('./package.json').version;
module.exports={
 appId:'org.relayworkbench.desktop',
 productName:'Relay Workbench',
 executableName:'Relay-Workbench',
 electronVersion:require('./package.json').devDependencies.electron,
 electronDist:path.dirname(require('electron')),
 directories:{app:'release/installer-app',output:'release/publish',buildResources:'dist'},
 files:['**/*','!**/test-*.cjs'],
 asar:true,npmRebuild:false,publish:null,
 artifactName:'Relay-Workbench-'+version+'-x64.zip',
 win:{target:[{target:'nsis',arch:['x64']},{target:'zip',arch:['x64']}],icon:'dist/relay.ico',signExecutable:false},
 nsis:{
  artifactName:'Relay-Workbench-Setup-'+version+'-x64.exe',
  oneClick:false,perMachine:false,selectPerMachineByDefault:false,allowElevation:false,
  allowToChangeInstallationDirectory:true,
  createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Relay Workbench',
  runAfterFinish:false,deleteAppDataOnUninstall:false,
  installerIcon:'dist/relay.ico',uninstallerIcon:'dist/relay.ico',
  installerLanguages:['en_US','he_IL'],language:'1033',license:'LICENSE'
 },
 extraFiles:[
  {from:'LICENSE',to:'APP-LICENSE.txt'},
  {from:'licenses',to:'licenses'},
  {from:'desktop/vendor/WORKBENCH-LICENSES.txt',to:'THIRD-PARTY-NOTICES.txt'}
 ]
};
