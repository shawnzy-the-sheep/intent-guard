import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
type Variant='good' | 'hierarchy' | 'ownership' | 'action';
const labels: Record<Variant,string> = { good:'Good hierarchy',hierarchy:'Hierarchy regression',ownership:'Ownership ambiguity',action:'Action regression' };
function App() {
  const path=window.location.pathname.split('/').pop() as Variant;
  const variant:Variant=path in labels ? path : 'good';
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState('');
  const task = { id:1042,title:'Review customer migration',status:'In Progress',job:'Customer Migration',jobStatus:'Not Started' };
  const continueAction=<button data-action="continue-task" className={variant==='action' ? 'muted-action' : 'primary-action'} onClick={()=>{setWorking(true);setMessage('Task workspace opened. You can continue reviewing the migration.');}}>Continue Task <span aria-hidden="true">↗</span></button>;
  const job=<aside data-entity="parent-job" className={`job-card ${variant==='hierarchy' ? 'loud-job' : ''} ${variant==='ownership' ? 'ambiguous-job' : ''}`}>
    {variant==='ownership' && <p className="orphan-status" role="status">This Job has not started</p>}
    <div className="job-context"><p className="eyebrow">Parent Job</p><h2>{task.job}</h2>{variant!=='ownership' && <p role="status" className="job-status">{variant==='hierarchy' ? 'THIS JOB HAS NOT STARTED' : `Status: ${task.jobStatus}`}</p>}<p className="job-note">The parent workflow provides context for this task.</p></div>
  </aside>;
  return <div className="shell">
    <header className="topbar"><a className="brand" href="/demo/good"><span className="brand-mark" aria-hidden="true">i</span> IntentGuard <span className="brand-divider">/</span> <span className="workspace-name">Task workspace</span></a><span className="demo-badge">UX intent lab</span></header>
    <div className="lab-nav"><p className="eyebrow">Same task. Different meaning.</p><nav aria-label="Demo variants">{(Object.keys(labels) as Variant[]).map(v=><a key={v} aria-current={variant===v ? 'page' : undefined} href={`/demo/${v}`}>{labels[v]}</a>)}</nav></div>
    <main><div className="breadcrumb">Workspace <span>/</span> Tasks <span>/</span> #{task.id}</div>
      <div className="screen-label"><span className="tiny-dot"/>{labels[variant]}<span>Operator view</span></div>
      {variant==='hierarchy' && job}
      <div className={`task-layout ${variant==='ownership' ? 'ownership-layout' : ''}`}>
        <section data-entity="task" className="task-card">
          <div className="task-heading"><p className="eyebrow">Current Task · #{task.id}</p><span className="status-chip" role="status">{task.status}</span></div>
          <h1>{task.title}</h1><p className="task-description">Verify the migration checklist and confirm that the customer workspace is ready for the next stage.</p>
          <dl><div><dt>Assigned to</dt><dd><span className="avatar">AL</span> Alex Lee</dd></div><div><dt>Due date</dt><dd>24 October 2026</dd></div><div><dt>Progress</dt><dd>3 of 5 checks complete</dd></div></dl>
          <div className="progress-track" aria-hidden="true"><span/></div>
          <div className={`task-actions ${variant==='action' ? 'crowded-actions' : ''}`}>{variant!=='action' && continueAction}{['Edit','Export','Assign','Settings'].map(label=><button key={label} className={variant==='action' ? 'competing-action' : 'secondary-action'} onClick={()=>setMessage(`${label} selected.`)}>{label}</button>)}{variant==='action' && continueAction}</div>
          {working && <section className="workspace-panel"><h2>Migration review</h2><p>Customer workspace ready. Review the remaining two checks.</p></section>}
          <p className="feedback" role="status" aria-live="polite">{message}</p>
          {variant==='ownership' && job}
        </section>
        {variant==='good' || variant==='action' ? job : null}
      </div>
      <footer className="context-note"><span aria-hidden="true">◎</span> Presentation changes across variants. Task data and actions stay identical.</footer>
    </main>
    <footer className="lab-footer"><span>IntentGuard <b>CI for UX intent.</b></span><span>Task #1042 · Desktop demo</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
