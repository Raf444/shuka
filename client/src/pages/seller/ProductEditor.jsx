import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ErrorState, FieldError, Loading, Spinner } from '../../components/ui.jsx';
import { Field } from '../Checkout.jsx';

const MAX_IMAGES = 5;
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function checkFiles(files, already) {
  const ok = [];
  const errors = [];
  for (const f of files) {
    if (!TYPES.includes(f.type)) { errors.push(`${f.name}: only JPEG, PNG or WebP images are allowed`); continue; }
    if (f.size > MAX_SIZE) { errors.push(`${f.name}: file is larger than 10 MB`); continue; }
    if (already + ok.length >= MAX_IMAGES) { errors.push(`You can add at most ${MAX_IMAGES} images`); break; }
    ok.push(f);
  }
  return { ok, errors };
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loaded, setLoaded] = useState(isNew);
  const [form, setForm] = useState({ title: '', category_id: '', description: '', price_amd: '', stock: '' });
  const [isPublished, setIsPublished] = useState(false);
  const [publishNow, setPublishNow] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  // Images: existing (server) for edit; pending local files for new
  const [images, setImages] = useState([]);
  const [pending, setPending] = useState([]); // [{file, url}]
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState('');

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    api.get(`/seller/products/${id}`)
      .then(({ product: p }) => {
        setForm({
          title: p.title || '',
          category_id: p.category?.id ? String(p.category.id) : '',
          description: p.description || '',
          price_amd: String(p.price_amd ?? ''),
          stock: String(p.stock ?? ''),
        });
        setIsPublished(!!p.is_published);
        setImages(sortImgs(p.images));
        setLoaded(true);
      })
      .catch(setLoadError);
  }, [id, isNew]);

  // Revoke object URLs on unmount
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const validate = () => {
    const fe = {};
    const title = form.title.trim();
    if (title.length < 3) fe.title = 'Title must be at least 3 characters';
    else if (title.length > 200) fe.title = 'Title is too long (max 200 characters)';
    if (!form.category_id) fe.category_id = 'Choose a category';
    if (!form.description.trim()) fe.description = 'Description is required';
    const price = Number(form.price_amd);
    if (form.price_amd === '' || !Number.isInteger(price) || price <= 0) fe.price_amd = 'Enter a price in whole dram, greater than 0';
    const stock = Number(form.stock);
    if (form.stock === '' || !Number.isInteger(stock) || stock < 0) fe.stock = 'Enter stock as a whole number (0 or more)';
    return fe;
  };

  const payload = () => ({
    title: form.title.trim(),
    category_id: Number(form.category_id),
    description: form.description.trim(),
    price_amd: Number(form.price_amd),
    stock: Number(form.stock),
  });

  const imageCount = isNew ? pending.length : images.length;

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const { ok, errors: errs } = checkFiles(files, imageCount);
    setImgError(errs.join('. '));
    if (!ok.length) return;
    if (isNew) {
      setPending((p) => [...p, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      return;
    }
    const fd = new FormData();
    ok.forEach((f) => fd.append('images', f));
    setImgBusy(true);
    try {
      const d = await api.upload(`/seller/products/${id}/images`, fd);
      setImages(sortImgs(d.images));
      toast.success(ok.length === 1 ? 'Image uploaded' : `${ok.length} images uploaded`);
    } catch (err) {
      setImgError(err.message);
      toast.error(err.message);
    } finally {
      setImgBusy(false);
    }
  };

  const removeImage = async (img, idx) => {
    if (isNew) {
      URL.revokeObjectURL(pending[idx].url);
      setPending((p) => p.filter((_, i) => i !== idx));
      return;
    }
    if (!window.confirm('Delete this image?')) return;
    setImgBusy(true);
    try {
      const d = await api.del(`/seller/products/${id}/images/${img.id}`);
      setImages(sortImgs(d.images));
      if (d.images.length === 0 && isPublished) toast.info('No images left — buyers may not see this product properly');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImgBusy(false);
    }
  };

  const makeMain = async (img, idx) => {
    if (isNew) {
      setPending((p) => [p[idx], ...p.filter((_, i) => i !== idx)]);
      return;
    }
    setImgBusy(true);
    try {
      const d = await api.post(`/seller/products/${id}/images/${img.id}/main`);
      setImages(sortImgs(d.images));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImgBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const fe = validate();
    setErrors(fe);
    if (Object.keys(fe).length) { toast.error('Please fix the highlighted fields'); return; }
    setSaving(true);

    if (!isNew) {
      try {
        setProgress('Saving…');
        await api.patch(`/seller/products/${id}`, payload());
        toast.success('Product saved');
        nav('/seller/products');
      } catch (err) {
        if (err.details) setErrors(err.details);
        toast.error(err.message);
      } finally {
        setSaving(false);
        setProgress('');
      }
      return;
    }

    let created = null;
    try {
      setProgress('Creating product…');
      const d = await api.post('/seller/products', { ...payload(), is_published: false });
      created = d.product;
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
      setSaving(false);
      setProgress('');
      return;
    }

    try {
      if (pending.length) {
        setProgress(`Uploading ${pending.length} image${pending.length > 1 ? 's' : ''}…`);
        const fd = new FormData();
        pending.forEach((p) => fd.append('images', p.file));
        await api.upload(`/seller/products/${created.id}/images`, fd);
      }
      if (pending.length && publishNow) {
        setProgress('Publishing…');
        await api.patch(`/seller/products/${created.id}`, { is_published: true });
        toast.success('Product published!');
      } else {
        toast.success(pending.length ? 'Product saved as draft' : 'Product saved as draft — add an image to publish it');
      }
      nav('/seller/products');
    } catch (err) {
      // Product exists already; continue in the edit page so nothing gets duplicated.
      toast.error(`Product saved as draft, but: ${err.message}`);
      nav(`/seller/products/${created.id}/edit`, { replace: true });
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  if (loadError) return <ErrorState error={loadError} />;
  if (!loaded) return <Loading />;

  const shown = isNew
    ? pending.map((p, i) => ({ key: p.url, src: p.url, main: i === 0, raw: p }))
    : images.map((img, i) => ({ key: img.id, src: img.thumb || img.large, main: i === 0, raw: img }));

  return (
    <div>
      <Link to="/seller/products" className="back-link">‹ Products</Link>
      <div className="toolbar">
        <h2 className="section-title">{isNew ? 'Add product' : 'Edit product'}</h2>
        {!isNew && (
          <span className={'badge ' + (isPublished ? 'badge-pub' : 'badge-draft')}>{isPublished ? 'Published' : 'Draft'}</span>
        )}
      </div>

      <form className="editor-layout" onSubmit={submit} noValidate>
        <section className="card form-card">
          <Field label="Title" error={errors.title}>
            <input value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Dried Armenian apricots, 500 g" />
          </Field>
          <Field label="Category" error={errors.category_id}>
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">Choose category…</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Description" error={errors.description}>
            <textarea rows="7" value={form.description} onChange={set('description')} placeholder="Describe the item: size, material, condition, what's included…" />
          </Field>
          <div className="form-grid">
            <Field label="Price (֏ AMD)" error={errors.price_amd}>
              <input type="number" inputMode="numeric" min="1" step="1" value={form.price_amd} onChange={set('price_amd')} />
            </Field>
            <Field label="Stock" error={errors.stock}>
              <input type="number" inputMode="numeric" min="0" step="1" value={form.stock} onChange={set('stock')} />
            </Field>
          </div>
        </section>

        <section className="card form-card">
          <div className="toolbar">
            <span className="label">Images <span className="muted">({imageCount}/{MAX_IMAGES})</span></span>
            {imgBusy && <Spinner small />}
          </div>
          <div className="img-grid">
            {shown.map((s, i) => (
              <div key={s.key} className={'img-tile' + (s.main ? ' is-main' : '')}>
                <img src={s.src} alt="" />
                {s.main && <span className="main-flag">Main</span>}
                <div className="img-actions">
                  {!s.main && (
                    <button type="button" onClick={() => makeMain(s.raw, i)} disabled={imgBusy}>Make main</button>
                  )}
                  <button type="button" className="danger" onClick={() => removeImage(s.raw, i)} disabled={imgBusy}>Delete</button>
                </div>
              </div>
            ))}
            {imageCount < MAX_IMAGES && (
              <button type="button" className="img-add" onClick={() => fileRef.current?.click()} disabled={imgBusy}>
                <span>＋</span>
                <span className="small">Add images</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPick} />
          <div className="muted small">JPEG, PNG or WebP, up to 10 MB each, max {MAX_IMAGES}. The first image is the main one.</div>
          <FieldError error={imgError || errors.images} />
          {isNew && (
            <label className="check">
              <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
              <span>Publish right away {pending.length === 0 && <span className="muted small">(needs at least one image)</span>}</span>
            </label>
          )}
        </section>

        <div className="editor-actions">
          {progress && <span className="muted"><Spinner small /> {progress}</span>}
          <Link to="/seller/products" className="btn btn-outline">Cancel</Link>
          <button className="btn btn-lg" disabled={saving || imgBusy}>
            {saving ? <Spinner small /> : isNew ? (publishNow && pending.length ? 'Create & publish' : 'Save draft') : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function sortImgs(list) {
  return [...(list || [])].sort((a, b) => a.position - b.position);
}
