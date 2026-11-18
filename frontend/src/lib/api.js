import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) console.warn('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env');
export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'public-anon-key');
const tables = new Set(['education','journeys','achievements','experiences','projects']);
const bucket = 'portfolio-media';
const fail = (error) => { const e = new Error(error?.message || 'Supabase request failed'); e.response = { data: { message: e.message }, status: error?.status || 500 }; throw e; };
const result = (data) => ({ data });
function cleanPayload(input) {
  const out = {};
  for (const [k,v] of Object.entries(input || {})) if (k !== 'id' && k !== 'created_at' && k !== 'updated_at' && v !== undefined) out[k] = v === '' ? null : v;
  return out;
}
async function upload(file) {
  const safe = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'-');
  const path = `${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(bucket).upload(path,file,{ upsert:false, contentType:file.type || undefined });
  if (error) fail(error);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
async function saveRecord(type, payload, id=null) {
  if (!tables.has(type)) fail({message:'Kategori konten tidak dikenal.'});
  const data = cleanPayload(payload);
  if (type === 'achievements' && data.image) { data.certificate_image = data.image; delete data.image; }
  const query = id
    ? supabase.from(type).update(data).eq('id',id).select().single()
    : supabase.from(type).insert(data).select().single();
  const {data:row,error} = await query;
  if (error) fail(error);
  return result(row);
}
const api = {
 async get(path) {
  const p = path.replace(/^\//,'');
  if (p === 'profile') { const {data,error}=await supabase.from('profiles').select('*').eq('id','main').maybeSingle(); if(error)fail(error); return result(data || {}); }
  if (p === 'auth/me') { const {data,error}=await supabase.auth.getUser(); if(error || !data.user)fail(error || {message:'Silakan login terlebih dahulu.'}); return result({admin:{id:data.user.id,email:data.user.email,name:data.user.user_metadata?.name || data.user.email}}); }
  if (p === 'admin/stats') { const stats={}; for(const t of tables){const {count,error}=await supabase.from(t).select('*',{count:'exact',head:true});if(error)fail(error);const {count:published,error:e2}=await supabase.from(t).select('*',{count:'exact',head:true}).eq('status','published');if(e2)fail(e2);stats[t]={total:count||0,published:published||0};} return result(stats); }
  const admin = p.startsWith('admin/'); const type = admin ? p.slice(6) : p;
  if (tables.has(type)) { let q=supabase.from(type).select('*').order('created_at',{ascending:false}); if(!admin)q=q.eq('status','published'); const {data,error}=await q;if(error)fail(error);return result(data||[]); }
  fail({message:`Endpoint tidak dikenal: ${p}`});
 },
 async post(path, body) {
  const p=path.replace(/^\//,'');
  if(p==='auth/login'){const {email,password}=body||{};const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)fail(error);return result(data);}
  if(p==='auth/logout'){const {error}=await supabase.auth.signOut();if(error)fail(error);return result({message:'Logout berhasil.'});}
  if(p==='admin/upload'){const file=body instanceof FormData?body.get('file'):null;if(!file)fail({message:'Pilih file terlebih dahulu.'});return result({url:await upload(file)});}
  const match=p.match(/^admin\/(education|journeys|achievements|experiences|projects)$/);
  if(match){const payload={};let file=null;if(body instanceof FormData){for(const [k,v] of body.entries()){if(k==='image'&&v instanceof File&&v.size)file=v;else payload[k]=v;}}else Object.assign(payload,body||{});if(file){const url=await upload(file);payload[match[1]==='achievements'?'certificate_image':'image']=url;}return saveRecord(match[1],payload);}
  fail({message:`Endpoint tidak dikenal: ${p}`});
 },
 async put(path, body) {
  const p=path.replace(/^\//,'');
  if(p==='admin/profile'){const payload={};let file=null;if(body instanceof FormData){for(const [k,v] of body.entries()){if(k==='profile_image'&&v instanceof File&&v.size)file=v;else payload[k]=v;}}else Object.assign(payload,body||{});if(file)payload.profile_image=await upload(file);const {data,error}=await supabase.from('profiles').upsert({id:'main',...cleanPayload(payload)}).select().single();if(error)fail(error);return result(data);}
  const match=p.match(/^admin\/(education|journeys|achievements|experiences|projects)\/([^/]+)$/);
  if(match){const payload={};let file=null;if(body instanceof FormData){for(const [k,v] of body.entries()){if(k==='image'&&v instanceof File&&v.size)file=v;else payload[k]=v;}}else Object.assign(payload,body||{});if(file){const url=await upload(file);payload[match[1]==='achievements'?'certificate_image':'image']=url;}return saveRecord(match[1],payload,match[2]);}
  fail({message:`Endpoint tidak dikenal: ${p}`});
 },
 async delete(path){const m=path.replace(/^\//,'').match(/^admin\/(education|journeys|achievements|experiences|projects)\/([^/]+)$/);if(!m)fail({message:'Endpoint tidak dikenal.'});const {error}=await supabase.from(m[1]).delete().eq('id',m[2]);if(error)fail(error);return result({message:'Konten berhasil dihapus.'});}
};
export const uploadUrl = (path) => path || '';
export default api;
