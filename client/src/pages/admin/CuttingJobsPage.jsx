import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, Scissors, Play, CheckCircle2, AlertTriangle, Layers, X, FileText, TrendingUp } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import ConfirmationDialog from '../../components/admin/ConfirmationDialog';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import {
  getCuttingJobs,
  addCuttingJob,
  startCuttingJob,
  completeCuttingJob,
  getCuttingJobDetails,
  getCuttingJobReport,
  getCustomers,
  getInventory
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency } from '../../utils/formatters';

function CuttingJobDetailPanel({ job, onClose, onStart, onComplete, onViewReport }) {
  if (!job) return null;
  const isCompleted = job.rawStatus === 'completed' || job.status === 'Completed';
  const isInProgress = job.rawStatus === 'in_progress' || job.status === 'In Progress';
  const inputs = job.inputs || [];
  const outputs = job.outputs || [];

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel detail-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="detail-panel__header">
          <div>
            <p className="detail-panel__subtitle">SAWMILL CUTTING RUN</p>
            <h2 className="detail-panel__title">{job.id} — {job.jobTitle}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
              <span className={`badge ${isCompleted ? 'badge-success' : isInProgress ? 'badge-info' : 'badge-warning'}`}>
                {job.status}
              </span>
              <span className="badge badge-secondary">{job.priority} Priority</span>
              <span className={`badge ${job.ownership === 'customer' ? 'badge-warning' : 'badge-primary'}`}>
                {job.ownership === 'customer' ? 'Customer Owned Timber' : 'Mill Inventory'}
              </span>
            </div>
          </div>
          <button className="detail-panel__close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="detail-panel__body">
          {/* Operation & Machinery Details */}
          <div className="detail-section">
            <div className="detail-section-title">Saw Line & Work Order Specifications</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Customer / Request</span>
                <span className="detail-field-value">{job.customer}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Assigned Saw Line</span>
                <span className="detail-field-value">{job.sawLine}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Target Cut Specification</span>
                <span className="detail-field-value--large" style={{ color: 'var(--color-forest)' }}>
                  {job.cuttingSpec}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Kerf Allowance</span>
                <span className="detail-field-value">{job.kerfAllowance}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Lead Sawyer / Operator</span>
                <span className="detail-field-value">{job.operator}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Scheduled Due Date</span>
                <span className="detail-field-value">{job.dueDate || job.due_date || '—'}</span>
              </div>
            </div>
          </div>

          {/* Recovery Yield & Waste Analysis */}
          <div className="detail-section">
            <div className="detail-section-title">Volumetric Balance & Recovery Yield</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Input Volume Scaled</span>
                <span className="detail-field-value--large">{job.inputVolume}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Finished Output Sawn</span>
                <span className="detail-field-value--large" style={{ color: '#16a34a' }}>
                  {job.targetOutput}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Wood Waste</span>
                <span className="detail-field-value--large" style={{ color: '#d97706' }}>
                  {job.wasteVolume ? `${job.wasteVolume} CFT` : 'Calculated on completion'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Wood Recovered</span>
                <span className="detail-field-value--large" style={{ color: job.recoveryRate >= 65 ? '#16a34a' : '#2563eb' }}>
                  {job.recoveryRate ? `${job.recoveryRate}%` : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Source Timber Batches */}
          <div className="detail-section">
            <div className="detail-section-title">Wood Used</div>
            {inputs.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Primary Log Tag: <strong>{job.logTag}</strong>
              </p>
            ) : (
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Batch Code</th>
                    <th>Species / Log Details</th>
                    <th>Quantity Used</th>
                    <th>Unit</th>
                    <th>Ownership</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((inp, idx) => (
                    <tr key={idx}>
                      <td><strong style={{ color: 'var(--color-forest)' }}>{inp.batch_code || inp.batchCode || job.logTag}</strong></td>
                      <td>{inp.species || inp.name || 'Raw Log'} ({inp.dimensions_text || 'Scaled Log'})</td>
                      <td><strong>{Number(inp.quantity_used || inp.quantity).toFixed(2)}</strong></td>
                      <td>{inp.unit || 'CFT'}</td>
                      <td>
                        <span className={`badge ${inp.batch_ownership === 'customer' || inp.ownership === 'customer' ? 'badge-warning' : 'badge-primary'}`}>
                          {inp.batch_ownership || inp.ownership || 'mill'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Finished Lumber Outputs */}
          {outputs.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Finished Wood Produced</div>
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Generated Batch</th>
                    <th>Product / Sawn Dimension</th>
                    <th>Pieces</th>
                    <th>Net Volume</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {outputs.map((out, idx) => (
                    <tr key={idx}>
                      <td><strong style={{ color: 'var(--color-forest)' }}>{out.generated_batch_code || `BATCH-${job.id}-OUT-${idx + 1}`}</strong></td>
                      <td>{out.product_name} ({out.dimensions_text})</td>
                      <td>{out.pieces_count} pcs</td>
                      <td><strong>{Number(out.volume_cbf).toFixed(2)} CFT</strong></td>
                      <td><span className="badge badge-info">{out.grade || 'Select Structural'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Financial & Labour Charges */}
          <div className="detail-section">
            <div className="detail-section-title">Cutting Costs</div>
            <div className="order-totals">
              <div className="order-totals-row">
                <span>Sawing Rate</span>
                <span>{formatCurrency(job.rate_per_cbf || 15.00)} / CFT</span>
              </div>
              <div className="order-totals-row">
                <span>Labour & Setup Charges</span>
                <span>{formatCurrency(job.labour_charges || 120.00)}</span>
              </div>
              <div className="order-totals-row--total order-totals-row">
                <span>Total Cutting Charges</span>
                <strong>{formatCurrency(job.totalCharges || (parseFloat(job.inputVolume) * 15 + 120) || 0)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="detail-panel__footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!isCompleted && !isInProgress && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStart(job)}
              >
                <Play size={14} /> <span>Start Run (Reserve Stock)</span>
              </button>
            )}
            {!isCompleted && isInProgress && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onComplete(job)}
              >
                <CheckCircle2 size={14} /> <span>Finish Run & Post Inventory</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onViewReport(job)}
            >
              <FileText size={14} /> <span>Cutting Job Report</span>
            </button>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ report, onClose }) {
  if (!report) return null;
  const { jobDetails, yieldAnalysis, financialSummary, sourceBatches, producedLumber } = report;

  return (
    <Modal isOpen={Boolean(report)} onClose={onClose} title={`Cutting Job Report — ${jobDetails.jobNumber}`} subtitle="Formal milling yield, volumetric discrepancy, and financial reconciliation" size="lg">
      <div style={{ padding: '0.5rem 0' }}>
        <div style={{ background: '#f8faf9', border: '1px solid #e2e8e4', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-forest-dark)' }}>{jobDetails.title}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.825rem' }}>
            <div><strong>Request Type:</strong> {jobDetails.jobType}</div>
            <div><strong>Client / Account:</strong> {jobDetails.customerName}</div>
            <div><strong>Ownership Class:</strong> {jobDetails.ownership}</div>
            <div><strong>Primary Saw Line:</strong> {jobDetails.sawLine}</div>
            <div><strong>Lead Sawyer:</strong> {jobDetails.leadSawyer}</div>
            <div><strong>Status:</strong> {jobDetails.status}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="admin-summary-pill" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem' }}>Input Volume:</span>
            <strong style={{ fontSize: '1.1rem' }}>{yieldAnalysis.totalInputVolumeCbf} CFT</strong>
          </div>
          <div className="admin-summary-pill" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem' }}>Output Sawn:</span>
            <strong style={{ fontSize: '1.1rem', color: '#16a34a' }}>{yieldAnalysis.totalOutputVolumeCbf} CFT</strong>
          </div>
          <div className="admin-summary-pill" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem' }}>Waste / Kerf Loss:</span>
            <strong style={{ fontSize: '1.1rem', color: '#d97706' }}>{yieldAnalysis.wasteVolumeCbf} CFT</strong>
          </div>
          <div className="admin-summary-pill" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.75rem' }}>Recovery Yield:</span>
            <strong style={{ fontSize: '1.1rem', color: yieldAnalysis.recoveryRatePercent >= 70 ? '#16a34a' : '#2563eb' }}>
              {yieldAnalysis.recoveryRatePercent}%
            </strong>
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h5 style={{ margin: '0 0 0.5rem 0' }}>Financial Charges Breakdown</h5>
          <div style={{ background: '#fff', border: '1px solid #e2e8e4', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem' }}>
              <span>Milling volume charge ({yieldAnalysis.totalInputVolumeCbf} CFT at {formatCurrency(financialSummary.ratePerCbf)}/CFT):</span>
              <strong>{formatCurrency(financialSummary.millingSubtotal)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem' }}>
              <span>Sawyer Labour & Blade Setup:</span>
              <strong>{formatCurrency(financialSummary.labourCharges)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.25rem 0', borderTop: '1px solid #e2e8e4', marginTop: '0.25rem', fontSize: '1rem', color: 'var(--color-forest-dark)' }}>
              <strong>Total Cutting Fee:</strong>
              <strong>{formatCurrency(financialSummary.totalCuttingCharges)}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close Report</button>
        </div>
      </div>
    </Modal>
  );
}

export default function CuttingJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventoryBatches, setInventoryBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [reportData, setReportData] = useState(null);

  const [form, setForm] = useState({
    jobTitle: '',
    jobType: 'customer_order',
    customerId: '',
    customer: 'Heritage Custom Homebuilders',
    batchId: '',
    logTag: 'LOG-WO-910',
    sawLine: 'Line 1 (60" Band Saw)',
    cuttingSpec: '2" x 8" x 16 ft Structural Sawn',
    kerfAllowance: '0.125"',
    inputVolume: '220',
    targetOutput: '1650',
    operator: 'Marcus Vance',
    priority: 'Normal',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsData, custData, invData] = await Promise.all([
        getCuttingJobs(),
        getCustomers(),
        getInventory({ timberType: 'raw_log' })
      ]);
      setJobs(jobsData);
      setCustomers(custData);
      setInventoryBatches(invData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRowClick = async (row) => {
    const details = await getCuttingJobDetails(row.dbId || row.id);
    setSelectedJob(details || row);
  };

  const handleStartRun = async (job) => {
    try {
      const id = job.dbId || job.id;
      await startCuttingJob(id);
      await loadData();
      const updated = await getCuttingJobDetails(id);
      setSelectedJob(updated);
    } catch (err) {
      alert(err.message || 'Error starting cutting run');
    }
  };

  const handleOpenComplete = (job) => {
    setCompleteTarget(job);
  };

  const handleMarkCompleted = async () => {
    if (!completeTarget) return;
    try {
      const id = completeTarget.dbId || completeTarget.id;
      await completeCuttingJob(id);
      await loadData();
      if (selectedJob && (selectedJob.dbId === id || selectedJob.id === id)) {
        const refreshed = await getCuttingJobDetails(id);
        setSelectedJob(refreshed);
      }
    } catch (err) {
      alert(err.message || 'Error completing cutting job');
    } finally {
      setCompleteTarget(null);
    }
  };

  const handleViewReport = async (job) => {
    const id = job.dbId || job.id;
    const report = await getCuttingJobReport(id);
    if (report) {
      setReportData(report);
    }
  };

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch =
        j.id.toLowerCase().includes(search.toLowerCase()) ||
        (j.jobTitle || '').toLowerCase().includes(search.toLowerCase()) ||
        (j.customer || '').toLowerCase().includes(search.toLowerCase()) ||
        (j.logTag || '').toLowerCase().includes(search.toLowerCase());
      const matchLine = lineFilter === 'All' || j.sawLine.includes(lineFilter);
      const matchStatus = statusFilter === 'All' || j.status === statusFilter;
      return matchSearch && matchLine && matchStatus;
    });
  }, [jobs, search, lineFilter, statusFilter]);

  const paginated = useMemo(() => {
    const s = (currentPage - 1) * pageSize;
    return filtered.slice(s, s + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const volNum = parseFloat(String(form.inputVolume).replace(/[^0-9.]/g, '')) || 100;
    const created = await addCuttingJob({
      ...form,
      inputVolume: `${volNum} CFT Log`,
      inputs: form.batchId ? [{ batch_id: Number(form.batchId), quantity_used: volNum }] : undefined
    });
    setJobs((prev) => [created, ...prev]);
    setIsModalOpen(false);
  };

  const columns = [
    {
      key: 'id',
      label: 'Job ID & Priority',
      sortable: true,
      render: (val, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest)' }}>{val}</strong>
          <div>
            <span
              className={`badge ${
                row.priority === 'Urgent'
                  ? 'badge-danger'
                  : row.priority === 'High'
                  ? 'badge-warning'
                  : 'badge-secondary'
              }`}
              style={{ fontSize: '0.65rem' }}
            >
              {row.priority}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'jobTitle',
      label: 'Job Description',
      sortable: true,
      render: (val, row) => (
        <div>
          <strong>{val}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-wood)' }}>
            Client: {row.customer} • Log: {row.logTag}
          </div>
        </div>
      )
    },
    { key: 'sawLine', label: 'Assigned Saw Line', sortable: true },
    {
      key: 'cuttingSpec',
      label: 'Cut Specification',
      render: (val, row) => (
        <div>
          <span>{val}</span>
          <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)' }}>
            Kerf: {row.kerfAllowance}
          </div>
        </div>
      )
    },
    { key: 'inputVolume', label: 'Input Vol' },
    { key: 'targetOutput', label: 'Target Output' },
    { key: 'operator', label: 'Lead Sawyer', sortable: true },
    {
      key: 'progress',
      label: 'Progress',
      sortable: true,
      render: (val, row) => (
        <div style={{ minWidth: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', marginBottom: '0.2rem' }}>
            <span>{row.status}</span>
            <strong>{val}%</strong>
          </div>
          <div style={{ height: '6px', background: '#e2e8e4', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${val}%`,
                background: val === 100 ? '#16a34a' : 'var(--color-forest)'
              }}
            />
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_, row) =>
        row.status !== 'Completed' ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenComplete(row);
            }}
          >
            <CheckCircle2 size={13} />
            <span>Finish Run</span>
          </button>
        ) : (
          <span className="badge badge-success">✓ Done</span>
        )
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Wood Cutting Work</h1>
          <p className="admin-subpage-subtitle">
            Manage headrig band saws, circular edgers, kerf loss optimization, operator assignments, and cutting orders.
          </p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}>
            <RefreshCw size={15} />
            <span>Sync</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            <span>Cut Wood</span>
          </button>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search job title, log tag, customer, or sawyer..."
          />
          <FilterPanel
            filters={[
              {
                key: 'line',
                label: 'Saw Line',
                value: lineFilter,
                onChange: setLineFilter,
                options: [
                  { label: 'All Saw Lines', value: 'All' },
                  { label: 'Line 1 (Band Saw)', value: 'Line 1' },
                  { label: 'Line 2 (Circular Edger)', value: 'Line 2' },
                  { label: 'Line 3 (Multi-Rip)', value: 'Line 3' },
                  { label: 'Horizontal Slabber', value: 'Slabber' }
                ]
              },
              {
                key: 'status',
                label: 'Run Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { label: 'All Statuses', value: 'All' },
                  { label: 'In Progress', value: 'In Progress' },
                  { label: 'Scheduled', value: 'Scheduled' },
                  { label: 'Completed', value: 'Completed' }
                ]
              }
            ]}
            onReset={() => {
              setLineFilter('All');
              setStatusFilter('All');
              setSearch('');
            }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading cutting jobs and floor schedule..." />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={paginated}
            keyField="id"
            onRowClick={handleRowClick}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
          />
        </>
      )}

      {selectedJob && (
        <CuttingJobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onStart={handleStartRun}
          onComplete={handleOpenComplete}
          onViewReport={handleViewReport}
        />
      )}

      {reportData && (
        <ReportModal
          report={reportData}
          onClose={() => setReportData(null)}
        />
      )}

      {/* Schedule Cutting Run Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Sawmill Cutting Run"
        subtitle="Assign raw logs to a primary band saw or edger with kerf specs"
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="admin-form-label">Job Title <span className="required">*</span></label>
              <input
                type="text"
                required
                className="admin-form-input"
                placeholder="e.g. Quarter Sawn White Oak Cant Run"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Production Request Type</label>
              <select
                className="admin-form-select"
                value={form.jobType}
                onChange={(e) => setForm({ ...form, jobType: e.target.value })}
              >
                <option value="customer_order">Custom Customer Milling</option>
                <option value="internal_production">Internal Mill Stock Production</option>
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Customer / Client</label>
              <select
                className="admin-form-select"
                disabled={form.jobType === 'internal_production'}
                value={form.customerId}
                onChange={(e) => {
                  const sel = customers.find((c) => String(c.id) === e.target.value);
                  setForm({
                    ...form,
                    customerId: e.target.value,
                    customer: sel ? sel.name : 'Mill Internal Stock'
                  });
                }}
              >
                <option value="">— Select Customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Source Timber Batch</label>
              <select
                className="admin-form-select"
                value={form.batchId}
                onChange={(e) => {
                  const sel = inventoryBatches.find((b) => String(b.id) === e.target.value);
                  setForm({
                    ...form,
                    batchId: e.target.value,
                    logTag: sel ? sel.batch_code || sel.batchCode : form.logTag,
                    inputVolume: sel ? String(sel.quantity_available || 150) : form.inputVolume
                  });
                }}
              >
                <option value="">— Select Available Log Batch —</option>
                {inventoryBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code || b.batchCode} — {b.species} ({b.quantity_available || b.quantity} {b.unit || 'CFT'} avail)
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Primary Saw Line</label>
              <select
                className="admin-form-select"
                value={form.sawLine}
                onChange={(e) => setForm({ ...form, sawLine: e.target.value })}
              >
                <option value='Line 1 (60" Band Saw)'>Line 1 (60" Band Saw)</option>
                <option value='Line 2 (Twin Circular Edger)'>Line 2 (Twin Circular Edger)</option>
                <option value='Line 3 (Multi-Rip Saw)'>Line 3 (Multi-Rip Saw)</option>
                <option value='Horizontal Slabber Line'>Horizontal Slabber Line</option>
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Cutting Dimension Spec <span className="required">*</span></label>
              <input
                type="text"
                required
                className="admin-form-input"
                placeholder='e.g. 2" x 8" x 16 ft'
                value={form.cuttingSpec}
                onChange={(e) => setForm({ ...form, cuttingSpec: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Blade Kerf Allowance</label>
              <input
                type="text"
                className="admin-form-input"
                value={form.kerfAllowance}
                onChange={(e) => setForm({ ...form, kerfAllowance: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Input Volume (CFT)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                className="admin-form-input"
                value={form.inputVolume}
                onChange={(e) => setForm({ ...form, inputVolume: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Assigned Lead Sawyer</label>
              <input
                type="text"
                className="admin-form-input"
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Priority Level</label>
              <select
                className="admin-form-select"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Scheduled Due Date</label>
              <input
                type="date"
                className="admin-form-input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Queue Cutting Run
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Finish Run */}
      <ConfirmationDialog
        isOpen={Boolean(completeTarget)}
        onClose={() => setCompleteTarget(null)}
        onConfirm={handleMarkCompleted}
        title="Complete Cutting Run & Post Inventory"
        message={`Complete Job ${completeTarget?.id} (${completeTarget?.jobTitle})? This will consume the input log stock, post finished lumber batches to inventory, and calculate final recovery yield.`}
        confirmLabel="Complete Run & Post"
        variant="primary"
      />
    </div>
  );
}
