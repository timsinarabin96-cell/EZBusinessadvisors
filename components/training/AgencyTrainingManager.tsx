'use client'

import { useCallback, useEffect, useState } from 'react'
import { Chip, EmptyState, GoldButton, PCard, Skeleton, SoftButton, Toggle } from '@/components/ui/premium'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'

type Material = { id: string; title: string; kind: string; url?: string | null }
type Module = {
  id: string
  template_id: string | null
  title: string
  description: string | null
  lesson_content: string
  quiz_question: string
  quiz_options: string[]
  quiz_correct_answer: string
  order: number
  is_required: boolean
  materials: Material[]
}
type Program = { id: string; title: string; use_default_templates: boolean }
type Editor = {
  id?: string
  title: string
  description: string
  lessonContent: string
  quizQuestion: string
  quizOptions: string[]
  quizCorrectAnswer: string
  isRequired: boolean
}

const blankEditor = (): Editor => ({
  title: '', description: '', lessonContent: '', quizQuestion: '',
  quizOptions: ['', '', '', ''], quizCorrectAnswer: '', isRequired: true,
})

export function AgencyTrainingManager() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [agencyName, setAgencyName] = useState('Your agency')
  const [program, setProgram] = useState<Program | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [materialModuleId, setMaterialModuleId] = useState('')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materialUrl, setMaterialUrl] = useState('')
  const [materialKind, setMaterialKind] = useState('link')
  const [materialFile, setMaterialFile] = useState<File | null>(null)

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession()
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${data.session?.access_token || ''}`)
    return fetch(path, { ...init, headers })
  }, [])

  const applyResponse = useCallback((json: any) => {
    setAgencyId(json.agencyId || '')
    setAgencyName(json.agencyName || 'Your agency')
    setProgram(json.program || null)
    setModules(json.modules || [])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const response = await request('/api/training/agency')
    const json = await response.json().catch(() => ({}))
    if (response.ok) applyResponse(json)
    else toast(json.error || 'Could not load agency training', 'error')
    setLoading(false)
  }, [applyResponse, request, toast])

  useEffect(() => { void load() }, [load])

  async function action(name: string, payload: Record<string, unknown> = {}) {
    setSaving(name)
    const response = await request('/api/training/agency', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: name, agencyId, ...payload }),
    })
    const json = await response.json().catch(() => ({}))
    setSaving('')
    if (!response.ok) { toast(json.error || 'Could not update training', 'error'); return false }
    applyResponse(json)
    return true
  }

  function editModule(module: Module) {
    setEditor({
      id: module.id, title: module.title, description: module.description || '', lessonContent: module.lesson_content,
      quizQuestion: module.quiz_question, quizOptions: [...module.quiz_options], quizCorrectAnswer: module.quiz_correct_answer,
      isRequired: module.is_required,
    })
  }

  async function saveModule() {
    if (!editor) return
    const module = { ...editor, quizOptions: editor.quizOptions.map((option) => option.trim()).filter(Boolean) }
    const ok = await action(editor.id ? 'update-module' : 'add-module', { moduleId: editor.id, module })
    if (ok) { setEditor(null); toast(editor.id ? 'Module updated.' : 'Custom module added.', 'success') }
  }

  async function uploadMaterial() {
    if (!materialModuleId || !materialTitle.trim()) return toast('Choose a module and enter a material title.', 'error')
    setSaving('attach-material')
    let response: Response
    if (materialFile) {
      const form = new FormData()
      form.set('agencyId', agencyId); form.set('moduleId', materialModuleId); form.set('title', materialTitle.trim()); form.set('file', materialFile)
      response = await request('/api/training/agency', { method: 'POST', body: form })
    } else {
      response = await request('/api/training/agency', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach-material', agencyId, moduleId: materialModuleId, material: { title: materialTitle.trim(), kind: materialKind, url: materialUrl.trim() } }),
      })
    }
    const json = await response.json().catch(() => ({}))
    setSaving('')
    if (!response.ok) return toast(json.error || 'Could not attach material', 'error')
    applyResponse(json); setMaterialTitle(''); setMaterialUrl(''); setMaterialFile(null)
    toast('Lesson material attached.', 'success')
  }

  if (loading) return <div style={{ display: 'grid', gap: 14 }}><Skeleton h={150} /><Skeleton h={180} /><Skeleton h={180} /></div>
  if (!program) return <EmptyState icon="🎓" title="Training program unavailable" sub="Refresh the page or contact support." />

  return <div style={{ display: 'grid', gap: 18 }}>
    <PCard
      title={<div>{agencyName}<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 500 }}>{program.title}</div></div>}
      actions={<Chip tone={program.use_default_templates ? 'gold' : 'blue'}>{program.use_default_templates ? 'Using default templates' : 'Custom program'}</Chip>}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div><div style={{ fontWeight: 800, color: 'var(--navy)' }}>Start from our 5 default modules</div><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Turn off to assign only your custom modules. Default content stays saved and can be re-enabled later.</div></div>
          <Toggle checked={program.use_default_templates} label={program.use_default_templates ? 'Defaults included' : 'Custom only'} onChange={(checked) => void action('set-default-mode', { useDefaultTemplates: checked })} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <GoldButton onClick={() => setEditor(blankEditor())}>＋ Add custom module</GoldButton>
          <SoftButton disabled={saving === 'reset-to-default'} onClick={() => {
            if (window.confirm('Add any missing default templates? Custom modules and completed training history will stay untouched.')) void action('reset-to-default').then((ok) => ok && toast('Missing default modules restored.', 'success'))
          }}>{saving === 'reset-to-default' ? 'Restoring…' : 'Reset missing defaults'}</SoftButton>
        </div>
      </div>
    </PCard>

    {editor && <ModuleEditor editor={editor} setEditor={setEditor} saving={saving !== ''} onSave={() => void saveModule()} onCancel={() => setEditor(null)} />}

    <div style={{ display: 'grid', gap: 12 }}>
      {modules.length === 0 ? <EmptyState icon="📚" title="No modules yet" sub="Add your first custom onboarding module to begin." /> : modules.map((module, index) => <PCard
        key={module.id}
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', background: '#15223b', color: '#fff', fontSize: 13 }}>{module.order}</span><span>{module.title}</span></div>}
        actions={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Chip tone={module.is_required ? 'red' : 'gray'}>{module.is_required ? 'Required' : 'Optional'}</Chip><Chip tone={module.template_id ? 'gold' : 'blue'}>{module.template_id ? 'Default template' : 'Custom'}</Chip></div>}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>{module.description || 'No description provided.'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SoftButton disabled={index === 0 || saving !== ''} onClick={() => void action('reorder', { moduleId: module.id, direction: 'up' })}>↑ Up</SoftButton>
            <SoftButton disabled={index === modules.length - 1 || saving !== ''} onClick={() => void action('reorder', { moduleId: module.id, direction: 'down' })}>↓ Down</SoftButton>
            {!module.template_id && <SoftButton onClick={() => editModule(module)}>Edit</SoftButton>}
            {!module.template_id && <SoftButton onClick={() => {
              if (window.confirm(`Delete “${module.title}”? Existing enrollment history is retained; the module will no longer be assigned.`)) void action('delete-module', { moduleId: module.id })
            }}>Delete</SoftButton>}
            <SoftButton onClick={() => setMaterialModuleId(materialModuleId === module.id ? '' : module.id)}>＋ Material</SoftButton>
          </div>
          {module.materials?.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{module.materials.map((material) => material.url
            ? <a key={material.id} href={material.url} target="_blank" rel="noreferrer" style={{ color: '#8a6415', fontSize: 13 }}>📎 {material.title}</a>
            : <span key={material.id} style={{ color: 'var(--muted)', fontSize: 13 }}>📎 {material.title}</span>)}</div>}
          {materialModuleId === module.id && <MaterialEditor
            title={materialTitle} setTitle={setMaterialTitle} url={materialUrl} setUrl={setMaterialUrl}
            kind={materialKind} setKind={setMaterialKind} file={materialFile} setFile={setMaterialFile}
            saving={saving === 'attach-material'} onUpload={() => void uploadMaterial()} onCancel={() => setMaterialModuleId('')}
          />}
        </div>
      </PCard>)}
    </div>
  </div>
}

function ModuleEditor({ editor, setEditor, saving, onSave, onCancel }: { editor: Editor; setEditor: (editor: Editor) => void; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const input = (key: keyof Editor, value: unknown) => setEditor({ ...editor, [key]: value })
  return <PCard title={editor.id ? 'Edit custom module' : 'Add custom module'} actions={<Chip tone="blue">Agency content</Chip>}>
    <div style={{ display: 'grid', gap: 14 }}>
      <Field label="Module title"><input className="input" value={editor.title} onChange={(event) => input('title', event.target.value)} /></Field>
      <Field label="Description"><textarea className="input" rows={2} value={editor.description} onChange={(event) => input('description', event.target.value)} /></Field>
      <Field label="Lesson content"><textarea className="input" rows={7} value={editor.lessonContent} onChange={(event) => input('lessonContent', event.target.value)} placeholder="Write the lesson agents must review before the quiz." /></Field>
      <Field label="Quiz question"><input className="input" value={editor.quizQuestion} onChange={(event) => input('quizQuestion', event.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>{editor.quizOptions.map((option, index) => <Field key={index} label={`Option ${index + 1}`}><input className="input" value={option} onChange={(event) => { const options = [...editor.quizOptions]; options[index] = event.target.value; input('quizOptions', options) }} /></Field>)}</div>
      <Field label="Correct answer"><select className="input" value={editor.quizCorrectAnswer} onChange={(event) => input('quizCorrectAnswer', event.target.value)}><option value="">Select the correct option</option>{editor.quizOptions.filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
      <Toggle checked={editor.isRequired} onChange={(checked) => input('isRequired', checked)} label="Required for onboarding completion" />
      <div style={{ display: 'flex', gap: 10 }}><GoldButton disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save module'}</GoldButton><SoftButton onClick={onCancel}>Cancel</SoftButton></div>
    </div>
  </PCard>
}

function MaterialEditor({ title, setTitle, url, setUrl, kind, setKind, file, setFile, saving, onUpload, onCancel }: { title: string; setTitle: (value: string) => void; url: string; setUrl: (value: string) => void; kind: string; setKind: (value: string) => void; file: File | null; setFile: (file: File | null) => void; saving: boolean; onUpload: () => void; onCancel: () => void }) {
  return <div style={{ border: '1px solid rgba(15,52,96,.12)', background: '#f8fafc', borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
    <div style={{ fontWeight: 800, color: 'var(--navy)' }}>Attach lesson material</div>
    <Field label="Title"><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Agency handbook" /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}><Field label="Link type"><select className="input" value={kind} onChange={(event) => setKind(event.target.value)}><option value="link">Web link</option><option value="video">Video URL</option><option value="pdf">PDF URL</option><option value="document">Document URL</option></select></Field><Field label="Public URL"><input className="input" value={url} disabled={Boolean(file)} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></Field></div>
    <Field label="Or upload PDF / video (50 MB max)"><input className="input" type="file" accept="application/pdf,video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field>
    <div style={{ display: 'flex', gap: 10 }}><GoldButton disabled={saving || (!url.trim() && !file)} onClick={onUpload}>{saving ? 'Attaching…' : 'Attach material'}</GoldButton><SoftButton onClick={onCancel}>Cancel</SoftButton></div>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</span>{children}</label>
}
