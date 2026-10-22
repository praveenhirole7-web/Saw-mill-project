import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Save, RotateCw } from 'lucide-react';
import { addWoodType, getWoodTypes, updateWoodType } from '../../services/adminApi';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { LANGUAGES } from '../../i18n/languages';
import './AdminPages.css';

const EMPTY_FORM = {
  slug: '',
  common_name_en: '',
  common_name_verified: false,
  scientific_name: '',
  scientific_name_verified: false,
  image_url: '',
  names: []
};

export default function WoodTypesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await getWoodTypes());
    } catch (loadError) {
      setError(loadError.message || 'Could not load wood types.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const beginEdit = (item) => {
    setEditingId(item.id);
    setForm({
      slug: item.slug,
      common_name_en: item.common_name_en,
      common_name_verified: Boolean(item.common_name_verified),
      scientific_name: item.scientific_name || '',
      scientific_name_verified: Boolean(item.scientific_name_verified),
      image_url: item.image_url || '',
      names: (item.names || []).map((name) => ({ ...name }))
    });
    setNotice('');
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const updateName = (index, field, value) => {
    setForm((current) => ({
      ...current,
      names: current.names.map((name, i) => i === index ? { ...name, [field]: value } : name)
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      scientific_name: form.scientific_name.trim() || null,
      image_url: form.image_url.trim() || null,
      names: form.names.filter((name) => name.name.trim()).map((name) => ({
        language_code: name.language_code,
        name: name.name.trim(),
        name_kind: name.name_kind || 'preferred',
        verified: Boolean(name.verified)
      }))
    };
    try {
      if (editingId) await updateWoodType(editingId, payload);
      else await addWoodType(payload);
      setNotice(editingId ? 'Wood type updated.' : 'Wood type added.');
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this wood type.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Wood Types</h1>
          <p className="admin-subpage-subtitle">Add wood names and update regional names. Mark a name verified only after checking it.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
          <RotateCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2>{editingId ? 'Edit Wood Type' : 'Add Wood Type'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <label className="admin-form-group">
              <span className="admin-form-label">English name *</span>
              <input className="admin-form-input" required maxLength={150} value={form.common_name_en}
                onChange={(event) => setForm({ ...form, common_name_en: event.target.value })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Unique slug *</span>
              <input className="admin-form-input" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100}
                value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Scientific name, if confirmed</span>
              <input className="admin-form-input" maxLength={200} value={form.scientific_name}
                onChange={(event) => setForm({ ...form, scientific_name: event.target.value, scientific_name_verified: event.target.value ? form.scientific_name_verified : false })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Product photograph URL</span>
              <input className="admin-form-input" type="url" maxLength={500} value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })} />
            </label>
          </div>
          <div className="admin-form-grid" style={{ margin: '0.5rem 0 1rem' }}>
            <label><input type="checkbox" checked={form.common_name_verified}
              onChange={(event) => setForm({ ...form, common_name_verified: event.target.checked })} /> English name checked</label>
            <label><input type="checkbox" checked={form.scientific_name_verified} disabled={!form.scientific_name}
              onChange={(event) => setForm({ ...form, scientific_name_verified: event.target.checked })} /> Scientific name checked</label>
          </div>

          <div className="admin-page-header">
            <h3>Regional names and aliases</h3>
            <button type="button" className="btn btn-outline" onClick={() => setForm({
              ...form,
              names: [...form.names, { language_code: 'kn', name: '', name_kind: 'preferred', verified: false }]
            })}><Plus size={15} /> Add regional name</button>
          </div>
          {form.names.map((name, index) => (
            <div className="admin-form-grid" key={`${name.id || 'new'}-${index}`} style={{ margin: '0.5rem 0' }}>
              <label className="admin-form-group">
                <span className="admin-form-label">Language</span>
                <select className="admin-form-select" value={name.language_code}
                  onChange={(event) => updateName(index, 'language_code', event.target.value)}>
                  {LANGUAGES.map(({ code, name }) => <option value={code} key={code}>{name}</option>)}
                </select>
              </label>
              <label className="admin-form-group">
                <span className="admin-form-label">Name</span>
                <input className="admin-form-input" maxLength={150} value={name.name}
                  onChange={(event) => updateName(index, 'name', event.target.value)} />
              </label>
              <label className="admin-form-group">
                <span className="admin-form-label">Name use</span>
                <select className="admin-form-select" value={name.name_kind || 'preferred'}
                  onChange={(event) => updateName(index, 'name_kind', event.target.value)}>
                  <option value="preferred">Main name</option>
                  <option value="alias">Other spelling / alias</option>
                </select>
              </label>
              <label><input type="checkbox" checked={Boolean(name.verified)}
                onChange={(event) => updateName(index, 'verified', event.target.checked)} /> Checked</label>
              <button type="button" className="btn btn-outline" onClick={() => setForm({
                ...form,
                names: form.names.filter((_, i) => i !== index)
              })}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save wood type'}
            </button>
            {editingId && <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="card" style={{ padding: '1rem' }}>
        <h2>Saved Wood Types</h2>
        {loading ? <LoadingSpinner message="Loading wood types..." /> : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead><tr><th>English name</th><th>Scientific name</th><th>Regional names</th><th>Action</th></tr></thead>
              <tbody>{items.map((item) => (
                <tr key={item.id}>
                  <td>{item.common_name_en}{item.common_name_verified ? '' : ' (not checked)'}</td>
                  <td>{item.scientific_name || 'Not added'}{item.scientific_name && !item.scientific_name_verified ? ' (not checked)' : ''}</td>
                  <td>{(item.names || []).map((name) => `${name.name} (${name.language_code})${name.verified ? '' : ' *'}`).join(', ') || 'None'}</td>
                  <td><button type="button" className="btn btn-outline" onClick={() => beginEdit(item)}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
