(() => {
  'use strict';
  const nodes=[...document.querySelectorAll('[data-i18n]')];
  const he=Object.fromEntries(nodes.map(node=>[node.dataset.i18n,[...node.childNodes].map(n=>n.nodeName==='BR'?'\n':n.textContent).join('')]));
  const en={
    skip:'Skip to content',menu:'Menu',navFeatures:'Features',navWorkflow:'How it works',navDownload:'Download',
    eyebrow:'Open source. An independent workspace.',
    headline1:'Your code. Your agents.',headline2:'One workspace.',
    description:'One place to talk to coding agents, edit files and review changes. Choose the right agent for a task — and hand it over when a different perspective helps.',
    interfaceLanguage:'Hebrew interface',downloadWindows:'Download for Windows',explore:'Explore the workspace',preview:'Developer preview',actualScreenshot:'Inside the actual app',
    providersKicker:'Your tools. Your choice.',
    providersDescription:'Choose an agent for each conversation. Each provider keeps its own account, models and permissions.',
    providersFootnote:'Connect custom local ACP agents too. Provider tools and accounts are installed and configured separately.',
    workflowKicker:'From the first prompt to a reviewed change',
    workflowTitle:'Keep the task moving.\nEven when agents change.',
    workflowText:'Start with your project folder. Work with your chosen agent, approve actions and inspect files. When you want another perspective, prepare a handoff draft you can read and edit before sending.',
    workflowDocs:'See the complete feature map',example:'Illustrative workflow',step1:'Choose',step2:'Review',step3:'Hand off',exampleBadge:'Example',
    demoDisclaimer:'Illustration only. This website demo does not run an agent or send any information.',
    featuresKicker:'The tools around the conversation',featuresTitle:'More than an answer.\nA way to work with it.',
    featuresIntro:'The tools between the prompt and the result live in the same workspace — with the changes kept in view.',
    editorTitle:'Files and context, beside the chat.',
    editorText:'A tabbed editor with syntax highlighting, project search, edit comparison and protection against external-file conflicts. Attach a saved file to a draft when the agent needs more context.',
    codeIllustration:'Visual example · CodeMirror editor in the app',
    reviewTitle:'Approvals stay in your hands.',
    reviewText:'Review command and file-change requests, answer questions and select permissions. Conversation history, plans and agent activity stay available for inspection.',
    reviewSampleTitle:'Action request',sampleApprove:'Approve',sampleDecline:'Decline',reviewSampleNote:'Illustration of the approval flow',
    gitTitle:'Changes you can follow.',
    gitText:'Inspect diffs, stage files and create local commits. Run up to two background tasks, each in a separate Git worktree, then reopen their conversations.',
    worktreeNote:'Separate working files per task. Worktrees are not an operating-system permission sandbox.',
    extra1:'Project instructions & skills',extra2:'MCP configuration',extra3:'Recovery snapshots',extra4:'Local diagnostics',extra5:'Light & dark themes',
    downloadKicker:'Ready to get started?',downloadTitle:'Your next workspace.\nOpen to change.',
    downloadText:'Download the installer, choose a project folder and connect your tools. The application source is open to inspect, modify and contribute to.',
    downloadInstaller:'Download the Windows installer',channel:'Release channel',channelValue:'Developer preview',licenseLabel:'Project license',signingLabel:'Publisher signature',unsigned:'Unsigned installer',
    checksumFallback:'File checksums are available on the release page',copyHash:'Copy checksum',portable:'Portable version (ZIP) ↗',allReleases:'All releases ↗',
    setupKicker:'From download to your first conversation',setupTitle:'Three simple steps.',setupGuide:'Read the getting-started guide ↗',
    setup1Title:'Install the workspace',setup1Text:'Run the EXE and complete the installation for your current Windows user. This is a developer preview without a publisher signature.',
    setup2Title:'Connect your own agent',setup2Text:'Install an official agent tool and sign in to its account. Claude also requires a separate SDK installation, explained in the guide.',
    setup3Title:'Choose a project and start',setup3Text:'Open a folder, choose an agent for the conversation and describe the task. Review and approve actions as needed.',
    faqKicker:'Before you download',faqTitle:'A few things to know.',
    q1:'Is it free?',a1:'The application source is available under the MIT license. Model access, quotas and subscriptions remain with the agent providers. The app does not supply AI credits or bypass account requirements.',
    q2:'Is this an official provider app?',a2:'No. Relay Workbench is an independent project. Provider names describe integrations, not endorsement or partnership. Available capabilities depend on the tool and account.',
    q3:'Where are files and conversations stored?',a3:'Project files stay in the folder you select. Settings, local conversations and snapshots are stored in your Windows profile. Sending a task to an agent may transmit content and files according to the tool and provider you choose.',
    privacyLink:'More about privacy ↗',q4:'Is this release ready for every use?',a4:'This is a Windows x64 developer preview: unsigned, with no automatic updates. UI and protocol tests are not live verification of every provider account. Review the documented limits and validation before use.',
    validationLink:'What was actually tested ↗',
    sourceKicker:'Open behind the interface, too',sourceTitle:'Read the code.\nHelp shape what comes next.',
    sourceText:'The complete application interface is built from maintained source. The repository includes build instructions, tests, contribution guidance and an honest feature and limitation map.',
    viewSource:'View the GitHub repository',footerNote:'An independent coding-agent workspace. Project code is MIT licensed; third-party components retain their own terms.',issues:'Report an issue',security:'Security'
  };
  const demos={
    he:[
      {agent:'Codex',role:'תכנון ושינוי ראשוני',prompt:'״הוסף טופס יצירת קשר לפרויקט.״',action:'בחירת הפרויקט והגדרת המשימה',explanation:'בחר תיקייה וסוכן, ושלח משימה במילים שלך. השיחה נשארת משויכת לסוכן שנבחר.'},
      {agent:'Codex',role:'בדיקה ואישור',prompt:'״לפני שממשיכים, נבדוק את השינויים.״',action:'סקירת הבקשה וההשוואה',explanation:'קרא בקשות פעולה והצג את השינוי בקבצים. האישור נשאר בחירה מפורשת שלך.'},
      {agent:'Claude',role:'סקירה מזווית נוספת',prompt:'״המשך מהטיוטה ובדוק את הטופס.״',action:'טיוטת הקשר לבדיקה',explanation:'הכן טיוטה עם ההקשר הנחוץ, ערוך אותה ופתח שיחה חדשה עם הסוכן הבא. רק שליחה מפורשת מעבירה את המשימה.'}
    ],
    en:[
      {agent:'Codex',role:'Plan and make the initial change',prompt:'“Add a contact form to this project.”',action:'Choose the project and task',explanation:'Choose a folder and an agent, then describe the task in your own words. The conversation stays associated with that agent.'},
      {agent:'Codex',role:'Review and approve',prompt:'“Let’s inspect the changes before continuing.”',action:'Review the request and diff',explanation:'Read action requests and inspect file changes. Approval remains an explicit choice you make.'},
      {agent:'Claude',role:'Review from another perspective',prompt:'“Continue from this draft and check the form.”',action:'Review the context draft',explanation:'Prepare a draft with the context you need, edit it and open a new conversation with the next agent. The task is transferred only when you explicitly send it.'}
    ]
  };
  let language='he',step=0,release=null;
  const nav=document.getElementById('navigation'),menu=document.getElementById('menu'),languageButton=document.getElementById('language');
  const tabs=[...document.querySelectorAll('[data-step]')];
  function setStep(value,focus=false){
    step=value;const demo=demos[language][step];
    for(const [index,tab] of tabs.entries()){tab.setAttribute('aria-selected',String(index===step));tab.tabIndex=index===step?0:-1;}
    const panel=document.getElementById('step-panel');panel.setAttribute('aria-labelledby','step-'+step);
    for(const key of ['agent','role','prompt','action','explanation'])document.getElementById('demo-'+key).textContent=demo[key];
    document.querySelector('.agent-avatar').textContent=demo.agent[0];if(focus)tabs[step].focus();
  }
  function renderMetadata(){
    if(!release)return;
    document.querySelectorAll('[data-version]').forEach(node=>{node.textContent=release.version;});
    document.getElementById('file-size').textContent=new Intl.NumberFormat(language==='he'?'he-IL':'en-US',{maximumFractionDigits:1}).format(release.installer.bytes/1000000)+' MB';
    document.querySelectorAll('[data-download]').forEach(node=>{node.href=release.installer.url;});
    document.querySelectorAll('[data-portable]').forEach(node=>{node.href=release.portable.url;});
    const checksum=document.getElementById('checksum');checksum.removeAttribute('data-i18n');checksum.textContent=release.installer.sha256;
    document.getElementById('copy-hash').hidden=false;
  }
  function applyLanguage(next){
    language=next;document.documentElement.lang=next;document.documentElement.dir=next==='he'?'rtl':'ltr';
    for(const node of nodes){if(node.id==='checksum'&&release)continue;node.textContent=(next==='en'?en:he)[node.dataset.i18n]||he[node.dataset.i18n]||'';}
    languageButton.textContent=next==='he'?'EN':'עברית';languageButton.lang=next==='he'?'en':'he';languageButton.setAttribute('aria-label',next==='he'?'Switch to English':'מעבר לעברית');
    nav.setAttribute('aria-label',next==='he'?'ניווט ראשי':'Main navigation');
    document.querySelector('.providers').setAttribute('aria-label',next==='he'?'סוכנים נתמכים':'Supported agents');
    document.querySelector('.step-tabs').setAttribute('aria-label',next==='he'?'שלבי עבודה לדוגמה':'Example workflow steps');
    document.querySelector('.code-card').setAttribute('aria-label',next==='he'?'דוגמת קוד להמחשת העורך':'Illustrative editor code example');
    document.querySelector('.product-image').alt=next==='he'?'ממשק Relay Workbench עם שיחות, בחירת סוכן וסביבת עבודה בעברית':'The actual Relay Workbench desktop interface, with conversation, agent selection and Hebrew project workspace';
    document.title=next==='he'?'Relay Workbench — סביבת עבודה לסוכני קוד':'Relay Workbench — Your code. Your agents. One workspace.';
    document.getElementById('copy-status').textContent='';setStep(step);renderMetadata();
    try{localStorage.setItem('relay.language',next);}catch{}
  }
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  nav.addEventListener('click',event=>{if(event.target.closest('a')){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}});
  languageButton.addEventListener('click',()=>applyLanguage(language==='he'?'en':'he'));
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>setStep(index));
    tab.addEventListener('keydown',event=>{
      if(event.key==='Home'||event.key==='End'){event.preventDefault();setStep(event.key==='Home'?0:tabs.length-1,true);}
      else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();let delta=event.key==='ArrowRight'?1:-1;if(language==='he')delta=-delta;setStep((step+delta+tabs.length)%tabs.length,true);}
    });
  });
  document.getElementById('copy-hash').addEventListener('click',async()=>{
    if(!release)return;let copied=false;
    try{await navigator.clipboard.writeText(release.installer.sha256);copied=true;}catch{
      const input=document.createElement('textarea');input.value=release.installer.sha256;document.body.append(input);input.select();copied=document.execCommand('copy');input.remove();
    }
    document.getElementById('copy-status').textContent=language==='he'?(copied?'החתימה הועתקה':'אפשר לסמן ולהעתיק את החתימה'):(copied?'Checksum copied':'Select the checksum to copy it');
  });
  try{language=localStorage.getItem('relay.language')==='en'?'en':'he';}catch{}applyLanguage(language);
  fetch('./release.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Metadata unavailable');return response.json();}).then(data=>{
    const prefix='https://github.com/huxhkuh/relay-workbench/releases/download/';
    if(!data.installer?.url?.startsWith(prefix)||!data.portable?.url?.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(data.installer.sha256)||!Number.isSafeInteger(data.installer.bytes))throw Error('Invalid release metadata');
    release=data;renderMetadata();
  }).catch(()=>{ /* The direct versioned GitHub links remain usable without metadata. */ });
})();
