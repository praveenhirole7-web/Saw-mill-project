import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, RefreshCw, Edit, Trash2, Eye, X, AlertTriangle, Package, Download,
  ArrowDownLeft, ArrowUpRight, SlidersHorizontal, CheckCircle2, AlertCircle, History
} from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import ConfirmationDialog from '../../components/admin/ConfirmationDialog';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import EmptyState from '../../components/admin/EmptyState';
import {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryItemDetails,
  recordStockReceipt,
  recordStockIssue,
  recordStockAdjustment,
  getWoodTypes
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedWoodName, getWoodSpeciesSuggestions, isWoodNameVerified } from '../../i18n/woodSpecies';

const EMPTY_FORM = {
  name: '',
  sku: '',
  image_url: '',
  species: '',
  wood_type_id: '',
  timber_type: 'sawn_timber',
  category: '',
  grade: '',
  dimensions: '',
  length_feet: '',
  width_inches: '',
  thickness_inches: '',
  girth_inches: '',
  pieces_count: '',
  quantity: '',
  unit: 'CFT',
  costPrice: '',
  sellingPrice: '',
  location: '',
  moisturePercent: '',
  minStockThreshold: '',
  ownership: 'mill',
  customer_id: '',
  notes: ''
};

function calculateLiveVolume(form) {
  const pieces = Math.max(1, parseInt(form.pieces_count || 1, 10));
  const l = Number(form.length_feet || 0);

  if (form.timber_type === 'raw_log') {
    const g = Number(form.girth_inches || 0);
    if (g > 0 && l > 0) {
      const singleCbf = ((g / 4) * (g / 4) * l) / 144;
      const cbf = Number((singleCbf * pieces).toFixed(3));
      return { cbf, bf: Number((cbf * 12).toFixed(2)) };
    }
  } else {
    const t = Number(form.thickness_inches || 0);
    const w = Number(form.width_inches || 0);
    if (t > 0 && w > 0 && l > 0) {
      const cbf = Number(((t * w * l * pieces) / 144).toFixed(3));
      const bf = Number(((t * w * l * pieces) / 12).toFixed(2));
      return { cbf, bf };
    }
  }
  return { cbf: 0, bf: 0 };
}

function InventoryDetailPanel({ item, onClose, onEdit, onDelete, onReceive, onIssue, onAdjust }) {
  const { t, language } = useLanguage();
  const [movements, setMovements] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (item?.id) {
      setLoadingDetails(true);
      getInventoryItemDetails(item.id)
        .then((data) => {
          if (data?.movements) setMovements(data.movements);
        })
        .finally(() => setLoadingDetails(false));
    }
  }, [item?.id]);

  if (!item) return null;

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="detail-panel__header">
          <div>
            <p className="detail-panel__subtitle">
              BATCH RECORD • {item.ownership === 'customer' ? 'CUSTOMER OWNED' : 'MILL OWNED'}
            </p>
            <h2 className="detail-panel__title">{item.name}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
              <span className={`badge ${item.status === 'In Stock' ? 'badge-success' : item.status === 'Low Stock' ? 'badge-warning' : 'badge-danger'}`}>
                {item.status}
              </span>
              <span className="badge badge-info">{item.timberType === 'raw_log' ? 'Raw Round Log' : 'Sawn Lumber'}</span>
            </div>
          </div>
          <button className="detail-panel__close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="inventory-action-toolbar">
          <button type="button" className="btn btn-outline" onClick={() => onReceive(item)}>
            <ArrowDownLeft size={14} style={{ color: '#16a34a' }} />
            <span>Receive Wood</span>
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onIssue(item)}>
            <ArrowUpRight size={14} style={{ color: '#ea580c' }} />
            <span>Remove Wood</span>
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onAdjust(item)}>
            <SlidersHorizontal size={14} style={{ color: '#2563eb' }} />
            <span>Adjust Stock</span>
          </button>
        </div>

        <div className="detail-panel__body">
          {item.imageUrl && <img src={item.imageUrl} alt={`${item.species} timber`} style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', marginBottom: '1rem' }} />}
          {/* Identification Section */}
          <div className="detail-section">
            <div className="detail-section-title">Identification & Specs</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Batch Code / SKU</span>
                <span className="detail-field-value" style={{ color: 'var(--color-forest)', fontWeight: 700 }}>{item.sku}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Timber Species</span>
                <span className="detail-field-value">{getLocalizedWoodName(item, t, language)}</span>
                {!isWoodNameVerified(item, language) && <small>Local name not yet verified</small>}
              </div>
              {item.scientificName && <div className="detail-field">
                <span className="detail-field-label">Scientific Name</span>
                <span className="detail-field-value">
                  {item.scientificName}{item.scientificNameVerified ? '' : ' (not verified)'}
                </span>
              </div>}
              <div className="detail-field">
                <span className="detail-field-label">Category</span>
                <span className="detail-field-value">{item.category}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Grade Quality</span>
                <span className="detail-field-value">{item.grade}</span>
              </div>
              {item.ownership === 'customer' && (
                <div className="detail-field">
                  <span className="detail-field-label">Customer Owner</span>
                  <span className="detail-field-value" style={{ color: '#b45309', fontWeight: 600 }}>{item.customerName || `Customer #${item.customerId}`}</span>
                </div>
              )}
              {catalogError && <div className="admin-inline-notice" role="status">{catalogError}</div>}
            </div>
          </div>

          {/* Stock Metrics Section */}
          <div className="detail-section">
            <div className="detail-section-title">Stock Quantities & Volume</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Available to Sell</span>
                <span className="detail-field-value--large" style={{ color: 'var(--color-forest)' }}>
                  {formatNumber(item.quantityAvailable ?? item.quantity)} {item.unit}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Total Stock in Yard</span>
                <span className="detail-field-value">{formatNumber(item.quantityTotal ?? item.quantity)} {item.unit}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Reserved for Orders</span>
                <span className="detail-field-value">{formatNumber(item.quantityReserved || 0)} {item.unit}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Consumed in Cutting</span>
                <span className="detail-field-value">{formatNumber(item.quantityConsumed || 0)} {item.unit}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Calculated CFT</span>
                <span className="detail-field-value">{item.volumeCbf ? `${item.volumeCbf} CFT` : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Board Feet</span>
                <span className="detail-field-value">{item.boardFeet ? `${item.boardFeet} BF` : '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Cut Dimensions</span>
                <span className="detail-field-value">{item.dimensions}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Yard Location</span>
                <span className="detail-field-value">{item.location}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Moisture Content</span>
                <span className="detail-field-value">{item.moisturePercent}% MC</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Min Threshold</span>
                <span className="detail-field-value">{item.minStockThreshold} {item.unit}</span>
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="detail-section">
            <div className="detail-section-title">Valuation</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Cost Price / Unit</span>
                <span className="detail-field-value">{formatCurrency(item.costPrice)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Selling Price / Unit</span>
                <span className="detail-field-value--large" style={{ color: 'var(--color-forest)' }}>{formatCurrency(item.sellingPrice)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Total Value</span>
                <span className="detail-field-value">
                  {formatCurrency(Number(item.quantity) * Number(item.sellingPrice))}
                </span>
              </div>
            </div>
          </div>

          {/* Stock Movements Ledger */}
          <div className="detail-section">
            <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <History size={14} /> Stock Movement Ledger (Audit Trail)
            </div>
            {loadingDetails ? (
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading ledger...</p>
            ) : movements.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No recorded stock movements yet.</p>
            ) : (
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', fontSize: '0.775rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', color: '#64748b' }}>
                          {formatDate(m.createdAt)}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: m.movementType.includes('receipt') || m.movementType.includes('add') ? '#dcfce7' : '#fee2e2',
                            color: m.movementType.includes('receipt') || m.movementType.includes('add') ? '#15803d' : '#b91c1c'
                          }}>
                            {m.movementType}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {m.quantity} {m.unit}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#334155' }}>
                          {m.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="detail-panel__footer">
          <button type="button" className="btn btn-outline" style={{ color: '#dc2626' }} onClick={() => onDelete(item)}>
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onEdit(item)}>
            <Edit size={14} /> Edit Metadata
          </button>
        </div>
      </div>
    </div>
  );
}

function InventoryForm({ formData, onChange, onSubmit, onClose, isEdit, woodTypes }) {
  const { t, language } = useLanguage();
  const speciesSuggestions = getWoodSpeciesSuggestions(t, language);
  const liveVol = useMemo(() => calculateLiveVolume(formData), [formData]);

  return (
    <form onSubmit={onSubmit}>
      <div className="admin-form-section">
        <div className="admin-form-section-title">Type & Identification</div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Timber Type <span className="required">*</span></label>
            <select
              className="admin-form-select"
              value={formData.timber_type}
              onChange={e => onChange({ ...formData, timber_type: e.target.value, category: e.target.value === 'raw_log' ? 'Round Logs' : 'Dimensional Lumber' })}
            >
              <option value="sawn_timber">Sawn / Finished Dimensional Lumber</option>
              <option value="raw_log">Raw Round Log (Girth Formula)</option>
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Item / Species Name <span className="required">*</span></label>
            <input type="text" required className="admin-form-input" placeholder="e.g. Douglas Fir 4x4 Post"
              value={formData.name} onChange={e => onChange({ ...formData, name: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Batch Code / SKU <span className="required">*</span></label>
            <input type="text" required className="admin-form-input" placeholder="e.g. BATCH-DF-4X4"
              value={formData.sku || formData.batch_code || ''} onChange={e => onChange({ ...formData, sku: e.target.value, batch_code: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Product photo URL (optional)</label>
            <input type="url" className="admin-form-input" maxLength={500} value={formData.image_url || ''}
              onChange={e => onChange({ ...formData, image_url: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Wood type from catalogue</label>
            <select className="admin-form-select" value={formData.wood_type_id || ''}
              onChange={(event) => {
                const selected = woodTypes.find((wood) => String(wood.id) === event.target.value);
                onChange({
                  ...formData,
                  wood_type_id: event.target.value,
                  species: selected?.common_name_en || formData.species
                });
              }}>
              <option value="">Not in catalogue / enter below</option>
              {woodTypes.map((wood) => <option key={wood.id} value={wood.id}>
                {getLocalizedWoodName(wood, t, language)}{wood.common_name_en !== getLocalizedWoodName(wood, t, language) ? ` (${wood.common_name_en})` : ''}
              </option>)}
            </select>
            <span className="admin-form-hint">Use a catalogue type when it matches the exact tree. Keep different species separate.</span>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Wood name / species</label>
            <input type="text" required list="inventory-wood-species" className="admin-form-input" value={formData.species}
              onChange={e => onChange({ ...formData, species: e.target.value, wood_type_id: '' })} />
            <datalist id="inventory-wood-species">
              {speciesSuggestions.map(({ key, value, label }) => (
                <option key={key} value={value} label={label} />
              ))}
            </datalist>
            <span className="admin-form-hint">{t('woodSpecies.hint')}</span>
            <span className="admin-form-hint">{t('woodSpecies.rosewoodNote')}</span>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Category</label>
            <select className="admin-form-select" value={formData.category}
              onChange={e => onChange({ ...formData, category: e.target.value })}>
              {['Round Logs','Dimensional Lumber','Structural Beams','Live Edge Slabs','Framing Lumber','Milled Siding'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Grade / Quality</label>
            <select className="admin-form-select" value={formData.grade}
              onChange={e => onChange({ ...formData, grade: e.target.value })}>
              {['FAS Kiln-Dried','Select & Better','#1 Common','#2 Common','Construction Grade','Rough Sawn'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Ownership</label>
            <select className="admin-form-select" value={formData.ownership || 'mill'}
              onChange={e => onChange({ ...formData, ownership: e.target.value })}>
              <option value="mill">Mill-Owned Stock (Marketplace)</option>
              <option value="customer">Customer-Owned (Custom Sawing)</option>
            </select>
          </div>
          {formData.ownership === 'customer' && (
            <div className="admin-form-group">
              <label className="admin-form-label">Customer ID / Client Ref <span className="required">*</span></label>
              <input type="number" required className="admin-form-input" placeholder="e.g. 1"
                value={formData.customer_id || ''} onChange={e => onChange({ ...formData, customer_id: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Measurements and volume</div>
        <p className="inventory-measurement-hint">
          Enter board sizes in inches and length in feet. Enter log girth in inches.
          The CFT figure is a reference; stock quantity stays in the unit you select below.
        </p>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Length (Feet) <span className="required">*</span></label>
            <input type="number" step="0.1" required min="0.1" className="admin-form-input"
              value={formData.length_feet || ''} onChange={e => onChange({ ...formData, length_feet: e.target.value })} />
            <span className="admin-form-hint">Enter the log or board length in feet. Example: 10 ft.</span>
          </div>

          {formData.timber_type === 'raw_log' ? (
            <div className="admin-form-group">
              <label className="admin-form-label">Girth (Inches) <span className="required">*</span></label>
              <input type="number" step="0.1" required min="1" className="admin-form-input" placeholder="e.g. 36"
                value={formData.girth_inches || ''} onChange={e => onChange({ ...formData, girth_inches: e.target.value })} />
              <span className="admin-form-hint">Measure around the log in inches. Example: 36 in girth.</span>
            </div>
          ) : (
            <>
              <div className="admin-form-group">
                <label className="admin-form-label">Width (Inches) <span className="required">*</span></label>
                <input type="number" step="0.1" required min="0.1" className="admin-form-input" placeholder="e.g. 6"
                  value={formData.width_inches || ''} onChange={e => onChange({ ...formData, width_inches: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Thickness (Inches) <span className="required">*</span></label>
                <input type="number" step="0.1" required min="0.1" className="admin-form-input" placeholder="e.g. 2"
                  value={formData.thickness_inches || ''} onChange={e => onChange({ ...formData, thickness_inches: e.target.value })} />
              </div>
            </>
          )}

          <div className="admin-form-group">
            <label className="admin-form-label">Pieces Count</label>
            <input type="number" min="1" className="admin-form-input"
              value={formData.pieces_count || 1} onChange={e => onChange({ ...formData, pieces_count: e.target.value })} />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Quantity in Stock <span className="required">*</span></label>
            <div className="inventory-quantity-field">
              <input type="number" required min="0" step="0.001" className="admin-form-input"
                value={formData.quantity} onChange={e => onChange({ ...formData, quantity: e.target.value })} />
              <select required className="admin-form-select" aria-label="Stock quantity unit" value={formData.unit}
                onChange={e => onChange({ ...formData, unit: e.target.value })}>
                {[
                  ['CFT', 'Cubic feet (CFT)'],
                  ['Cubic metres (m³)', 'Cubic metres (m³)'],
                  ['Board Feet', 'Board feet'],
                  ['Pieces', 'Pieces'],
                  ['Slabs', 'Slabs'],
                  ['Sq Ft', 'Square feet'],
                  ['Feet', 'Feet'],
                  ['Inches', 'Inches'],
                  ['Meters', 'Metres (length)'],
                  ['Kilograms (kg)', 'Kilograms (kg)']
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <span className="admin-form-hint">Use one unit for this batch. The app does not convert units. Board size: thickness x width in inches, then length in feet. Example: 2 x 6 x 10 ft.</span>
          </div>
        </div>

        <div className="inventory-volume-preview">
          <div>
            <span>Calculated volume</span>
            <strong>{liveVol.cbf} CFT</strong>
          </div>
          <div>
            <span>Board feet equivalent</span>
            <strong>{liveVol.bf} BF</strong>
          </div>
          <div>
            <span>Size entered</span>
            <span className="inventory-volume-preview__spec">
              {formData.timber_type === 'raw_log'
                ? `${formData.length_feet || 0} ft × ${formData.girth_inches || 0}" girth`
                : `${formData.thickness_inches || 0}" × ${formData.width_inches || 0}" × ${formData.length_feet || 0} ft`}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Storage & Pricing</div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Min. Stock Alert Threshold</label>
            <input type="number" min="0" className="admin-form-input" value={formData.minStockThreshold || 50}
              onChange={e => onChange({ ...formData, minStockThreshold: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Yard / Bay Location</label>
            <input type="text" className="admin-form-input" placeholder="e.g. Yard Bay A-1"
              value={formData.location} onChange={e => onChange({ ...formData, location: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Moisture Content (%)</label>
            <input type="number" min="0" max="100" step="0.1" className="admin-form-input"
              value={formData.moisturePercent} onChange={e => onChange({ ...formData, moisturePercent: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Cost price (₹ per selected unit)</label>
            <input type="number" step="0.01" min="0" className="admin-form-input" value={formData.costPrice}
              onChange={e => onChange({ ...formData, costPrice: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Selling price (₹ per selected unit)</label>
            <input type="number" step="0.01" min="0" className="admin-form-input" value={formData.sellingPrice}
              onChange={e => onChange({ ...formData, sellingPrice: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Notes</div>
        <div className="admin-form-group">
          <textarea className="admin-form-textarea" rows={2} placeholder="Source details, timber inspection notes..."
            value={formData.notes || ''} onChange={e => onChange({ ...formData, notes: e.target.value })} />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {isEdit ? 'Update Batch' : 'Register Stock Batch'}
        </button>
      </div>
    </form>
  );
}

export default function InventoryPage() {
  const { t, language } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'raw_log', 'sawn_timber', 'customer'
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [speciesFilter, setSpeciesFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionTarget, setActionTarget] = useState(null); // { type: 'receive' | 'issue' | 'adjust', item }
  const [actionForm, setActionForm] = useState({ quantity: 10, reason: '', allow_negative: false, adjustment_type: 'add' });
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [woodTypes, setWoodTypes] = useState([]);
  const [catalogError, setCatalogError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getInventory({
        search,
        timberType: activeTab === 'raw_log' ? 'raw_log' : activeTab === 'sawn_timber' ? 'sawn_timber' : undefined,
        ownership: activeTab === 'customer' ? 'customer' : undefined,
        category: categoryFilter !== 'All' ? categoryFilter : undefined,
        species: speciesFilter !== 'All' ? speciesFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      });
      setItems(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to query inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getWoodTypes().then(setWoodTypes).catch((error) => {
      setCatalogError(error.message || 'Wood type catalogue could not be loaded.');
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab, categoryFilter, speciesFilter, statusFilter]);

  const filteredData = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.species.toLowerCase().includes(search.toLowerCase());

      const matchTab =
        activeTab === 'all' ? true :
        activeTab === 'raw_log' ? item.timberType === 'raw_log' :
        activeTab === 'sawn_timber' ? item.timberType === 'sawn_timber' :
        activeTab === 'customer' ? item.ownership === 'customer' : true;

      const matchCat = categoryFilter === 'All' || item.category === categoryFilter;
      const matchStat = statusFilter === 'All' || item.status === statusFilter;

      return matchSearch && matchTab && matchCat && matchStat;
    });
  }, [items, search, activeTab, categoryFilter, statusFilter]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;

  const openAdd = () => {
    setFormData(EMPTY_FORM);
    setIsAddModalOpen(true);
  };

  const openEdit = (item) => {
    setFormData({
      ...EMPTY_FORM,
      ...item,
      image_url: item.imageUrl || '',
      wood_type_id: item.woodTypeId || ''
    });
    setEditTarget(item);
    setSelectedItem(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const created = await addInventoryItem({
        ...formData,
        quantity: Number(formData.quantity),
        costPrice: Number(formData.costPrice),
        sellingPrice: Number(formData.sellingPrice),
        moisturePercent: Number(formData.moisturePercent),
        minStockThreshold: Number(formData.minStockThreshold || 50),
        dimensions: formData.timber_type === 'raw_log'
          ? `${formData.length_feet} ft × ${formData.girth_inches}" girth`
          : `${formData.thickness_inches}" × ${formData.width_inches}" × ${formData.length_feet} ft`
      });
      setItems(prev => [created, ...prev]);
      setIsAddModalOpen(false);
      setSuccessMessage(`Registered timber batch: ${created.sku || created.batchCode}`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create inventory batch.');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const updated = await updateInventoryItem(editTarget.id, {
        ...formData,
        costPrice: Number(formData.costPrice),
        sellingPrice: Number(formData.sellingPrice),
        moisturePercent: Number(formData.moisturePercent),
        minStockThreshold: Number(formData.minStockThreshold || 50)
      });
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setEditTarget(null);
      setSuccessMessage(`Updated batch ${updated.sku}`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update batch.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInventoryItem(deleteTarget.id);
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSelectedItem(null);
      setSuccessMessage('Batch removed from inventory.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Cannot delete batch.');
    }
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    const { type, item } = actionTarget;
    try {
      if (type === 'receive') {
        const res = await recordStockReceipt(item.id, {
          quantity: Number(actionForm.quantity),
          reason: actionForm.reason || 'Goods received and inspected',
        });
        setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
        setSuccessMessage(`Received ${actionForm.quantity} ${item.unit} into ${item.sku}`);
      } else if (type === 'issue') {
        const res = await recordStockIssue(item.id, {
          quantity: Number(actionForm.quantity),
          reason: actionForm.reason || 'Stock issued for order',
        });
        setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
        setSuccessMessage(`Issued ${actionForm.quantity} ${item.unit} from ${item.sku}`);
      } else if (type === 'adjust') {
        const res = await recordStockAdjustment(item.id, {
          adjustment_type: actionForm.adjustment_type,
          quantity: Number(actionForm.quantity),
          reason: actionForm.reason,
          allow_negative: actionForm.allow_negative,
        });
        setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
        setSuccessMessage(`Stock adjusted for ${item.sku}`);
      }
      setActionTarget(null);
      setSelectedItem(null);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Stock transaction failed.');
    }
  };

  const columns = [
    {
      key: 'sku', label: 'SKU / Batch Code', sortable: true,
      render: (val, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest)' }}>{val}</strong>
          <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)' }}>{row.location}</div>
        </div>
      )
    },
    {
      key: 'name', label: 'Description & Species', sortable: true,
      render: (val, row) => (
        <div>
          {row.imageUrl && <img src={row.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', marginRight: 8, verticalAlign: 'middle' }} />}
          <strong>{val}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-wood)' }}>
            {getLocalizedWoodName(row, t, language)}{!isWoodNameVerified(row, language) ? '*' : ''} • {row.grade}
            {row.ownership === 'customer' && <span style={{ marginLeft: 6, color: '#b45309', fontWeight: 600 }}>[Customer Owned]</span>}
          </div>
          {!isWoodNameVerified(row, language) && <small>Local name not yet verified</small>}
          {row.scientificName && <small>{row.scientificName}{row.scientificNameVerified ? '' : ' (not verified)'}</small>}
        </div>
      )
    },
    {
      key: 'timberType', label: 'Type', sortable: true,
      render: (val) => val === 'raw_log' ? '🪵 Round Log' : '📏 Sawn Lumber'
    },
    { key: 'dimensions', label: 'Dimensions' },
    {
      key: 'quantityAvailable', label: 'Available Stock', sortable: true,
      render: (_, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest)' }}>{formatNumber(row.quantityAvailable ?? row.quantity)}</strong> {row.unit}
          {row.quantityReserved > 0 && (
            <div style={{ fontSize: '0.7rem', color: '#ea580c' }}>({row.quantityReserved} reserved)</div>
          )}
        </div>
      )
    },
    {
      key: 'volumeCbf', label: 'Volume (CFT)', sortable: true,
      render: (val) => val ? `${Number(val).toFixed(2)} CFT` : '—'
    },
    {
      key: 'sellingPrice', label: 'Unit Price', sortable: true,
      render: (val) => formatCurrency(val)
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (val) => (
        <span className={`badge ${val === 'In Stock' ? 'badge-success' : val === 'Low Stock' ? 'badge-warning' : 'badge-danger'}`}>
          {val}
        </span>
      )
    },
    {
      key: 'actions', label: 'Actions', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" style={{ padding: '0.3rem 0.55rem' }}
            onClick={e => { e.stopPropagation(); openEdit(row); }} title="Edit">
            <Edit size={13} />
          </button>
          <button type="button" className="btn btn-outline"
            style={{ padding: '0.3rem 0.55rem', color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={e => { e.stopPropagation(); setDeleteTarget(row); }} title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      )
    }
  ];

  const filterOptions = [
    {
      key: 'species', label: 'Wood type', value: speciesFilter, onChange: setSpeciesFilter,
      options: [
        { label: 'All wood types', value: 'All' },
        ...woodTypes.map((wood) => ({
          label: getLocalizedWoodName(wood, t, language),
          value: wood.common_name_en
        }))
      ]
    },
    {
      key: 'category', label: 'Category', value: categoryFilter, onChange: setCategoryFilter,
      options: [
        { label: 'All Categories', value: 'All' },
        ...['Round Logs','Dimensional Lumber','Structural Beams','Live Edge Slabs','Framing Lumber','Milled Siding']
          .map(c => ({ label: c, value: c }))
      ]
    },
    {
      key: 'status', label: 'Availability', value: statusFilter, onChange: setStatusFilter,
      options: [
        { label: 'All Statuses', value: 'All' },
        { label: 'In Stock', value: 'In Stock' },
        { label: 'Low Stock', value: 'Low Stock' },
        { label: 'Consumed', value: 'Consumed' }
      ]
    }
  ];

  const totalValue = items.reduce((s, i) => s + Number(i.quantityAvailable ?? i.quantity) * Number(i.sellingPrice || 0), 0);
  const totalCbf = items.reduce((s, i) => s + Number(i.volumeCbf || 0), 0);

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Wood Stock</h1>
          <p className="admin-subpage-subtitle">Transactional stock tracking, volumetric calculators (Hoppus & CFT), and immutable movement ledger.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}><RefreshCw size={15} /><span>Sync</span></button>
          <button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={16} /><span>Add Inventory Batch</span></button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="admin-alert admin-alert--success" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#dcfce7', color: '#15803d', borderRadius: 6, marginBottom: 16 }}>
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="admin-alert admin-alert--danger" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}
      {catalogError && <div className="admin-inline-notice" role="status">{catalogError}</div>}

      {/* Summary Metrics */}
      <div className="admin-summary-pills">
        <div className="admin-summary-pill"><span>Total Batches:</span><strong>{items.length}</strong></div>
        <div className="admin-summary-pill">
          <span>Low Stock:</span>
          <strong style={{ color: '#dc2626' }}>{items.filter(i => i.status === 'Low Stock').length} Batches</strong>
        </div>
        <div className="admin-summary-pill">
          <span>Total Yard Volume:</span>
          <strong style={{ color: 'var(--color-forest)' }}>{totalCbf.toFixed(1)} CFT</strong>
        </div>
        <div className="admin-summary-pill">
          <span>Total Yard Value:</span>
          <strong style={{ color: 'var(--color-forest)' }}>{formatCurrency(totalValue)}</strong>
        </div>
      </div>

      {/* View Segregation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1rem' }}>
        {[
          { id: 'all', label: 'All Inventory' },
          { id: 'raw_log', label: '🪵 Raw Round Logs' },
          { id: 'sawn_timber', label: '📏 Finished Dimensional Lumber' },
          { id: 'customer', label: '👤 Customer Owned Timber' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
            style={{
              padding: '0.6rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--color-forest)' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-forest)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search SKU, timber name, or species..." />
          <FilterPanel filters={filterOptions}
            onReset={() => { setSpeciesFilter('All'); setCategoryFilter('All'); setStatusFilter('All'); setSearch(''); }}
            totalResults={filteredData.length} />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Querying live MySQL inventory..." />
      ) : filteredData.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title="No timber batches found"
          description="Adjust your search criteria or create your first inventory batch."
          action={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add Inventory Batch</button>}
        />
      ) : (
        <>
          <DataTable columns={columns} data={paginatedData} keyField="id"
            onRowClick={row => setSelectedItem(row)} />
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredData.length}
            pageSize={pageSize} onPageChange={setCurrentPage}
            onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1); }} />
        </>
      )}

      {/* Detail Panel */}
      {selectedItem && (
        <InventoryDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={openEdit}
          onDelete={row => { setDeleteTarget(row); setSelectedItem(null); }}
          onReceive={item => setActionTarget({ type: 'receive', item })}
          onIssue={item => setActionTarget({ type: 'issue', item })}
          onAdjust={item => setActionTarget({ type: 'adjust', item })}
        />
      )}

      {/* Register Stock Batch Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)}
        title="Add wood to stock" subtitle="Choose the wood form, enter its size, quantity and price." size="lg">
        <InventoryForm formData={formData} onChange={setFormData}
            onSubmit={handleCreate} onClose={() => setIsAddModalOpen(false)} isEdit={false} woodTypes={woodTypes} />
      </Modal>

      {/* Edit Metadata Modal */}
      <Modal isOpen={Boolean(editTarget)} onClose={() => setEditTarget(null)}
        title="Edit Inventory Metadata" subtitle={`Updating record: ${editTarget?.sku}`} size="lg">
        <InventoryForm formData={formData} onChange={setFormData}
            onSubmit={handleEdit} onClose={() => setEditTarget(null)} isEdit={true} woodTypes={woodTypes} />
      </Modal>

      {/* Stock Transaction Modals (Receive / Issue / Adjust) */}
      <Modal
        isOpen={Boolean(actionTarget)}
        onClose={() => setActionTarget(null)}
        title={
          actionTarget?.type === 'receive' ? 'Record Stock Receipt' :
          actionTarget?.type === 'issue' ? 'Record Stock Issue (Dispatch)' : 'Record Stock Adjustment'
        }
        subtitle={`Batch: ${actionTarget?.item?.sku} (${actionTarget?.item?.name})`}
        size="md"
      >
        <form onSubmit={handleActionSubmit}>
          {actionTarget?.type === 'adjust' && (
            <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
              <label className="admin-form-label">Adjustment Type</label>
              <select
                className="admin-form-select"
                value={actionForm.adjustment_type}
                onChange={e => setActionForm({ ...actionForm, adjustment_type: e.target.value })}
              >
                <option value="add">Add Stock (+) (Physical count surplus)</option>
                <option value="deduct">Deduct Stock (-) (Damage, rot, shrinkage)</option>
                <option value="set_exact">Set Exact Count (=) (Physical stocktake count)</option>
              </select>
            </div>
          )}

          <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
            <label className="admin-form-label">Quantity ({actionTarget?.item?.unit}) <span className="required">*</span></label>
            <input
              type="number"
              step="0.01"
              required
              min="0.01"
              className="admin-form-input"
              value={actionForm.quantity}
              onChange={e => setActionForm({ ...actionForm, quantity: e.target.value })}
            />
          </div>

          <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
            <label className="admin-form-label">
              Reason / Source Reference <span className="required">*</span>
            </label>
            <input
              type="text"
              required
              minLength={5}
              placeholder={
                actionTarget?.type === 'receive' ? 'e.g. PO-2026-004 Delivered from Cascade' :
                actionTarget?.type === 'issue' ? 'e.g. SO-8841 Dispatch to Portland Millwork' :
                'e.g. Yard quarterly audit shrinkage correction'
              }
              className="admin-form-input"
              value={actionForm.reason}
              onChange={e => setActionForm({ ...actionForm, reason: e.target.value })}
            />
            <span className="admin-form-hint">Recorded in the immutable stock movement ledger</span>
          </div>

          {actionTarget?.type === 'adjust' && (
            <div className="admin-form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={actionForm.allow_negative}
                  onChange={e => setActionForm({ ...actionForm, allow_negative: e.target.checked })}
                />
                <span>Allow negative stock override (Requires Admin role)</span>
              </label>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setActionTarget(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm Transaction</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Timber Batch"
        message={`Are you sure you want to delete ${deleteTarget?.sku} (${deleteTarget?.name})? All historical movement logs will be permanently removed.`}
        confirmLabel="Delete Batch"
        variant="danger"
      />
    </div>
  );
}
