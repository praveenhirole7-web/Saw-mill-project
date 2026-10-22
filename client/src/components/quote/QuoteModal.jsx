import React, { useState, useEffect } from 'react';
import { X, Calculator, CheckCircle, ArrowRight } from 'lucide-react';
import Button from '../common/Button';
import { submitPublicEnquiry } from '../../services/publicEnquiry';
import './QuoteModal.css';

export default function QuoteModal({ isOpen, onClose, initialItem = '' }) {
  const [formData, setFormData] = useState({
    clientName: '',
    phone: '',
    email: '',
    species: initialItem,
    serviceType: '',
    thicknessInches: '2',
    widthInches: '6',
    lengthFeet: '8',
    quantity: '10',
    notes: ''
  });

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quoteEstimate, setQuoteEstimate] = useState(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateCbf = () => {
    const t = parseFloat(formData.thicknessInches) || 1;
    const w = parseFloat(formData.widthInches) || 1;
    const l = parseFloat(formData.lengthFeet) || 1;
    const q = parseInt(formData.quantity, 10) || 1;
    // Standard lumber cubic feet formula: (Thickness" * Width" * Length' * Qty) / 144
    const totalCbf = ((t * w * l * q) / 144).toFixed(2);
    return totalCbf;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cbf = calculateCbf();
    setSubmitting(true);
    setError('');
    try {
      const saved = await submitPublicEnquiry({
        source: 'quote',
        name: formData.clientName,
        phone: formData.phone,
        email: formData.email,
        requested_product: formData.species,
        quantity: formData.quantity,
        quantity_unit: 'pieces',
        message: `${formData.serviceType ? `Requested service: ${formData.serviceType}. ` : ''}Dimensions: ${formData.thicknessInches} in x ${formData.widthInches} in x ${formData.lengthFeet} ft. Estimated volume: ${cbf} CBF. ${formData.notes}`.trim()
      });
      setQuoteEstimate({ cbf, referenceNo: saved.reference, species: formData.species });
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError.message || 'We could not save your enquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setQuoteEstimate(null);
    onClose();
  };

  return (
    <div className="quote-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="quote-modal-title">
      <div className="quote-modal" onClick={(e) => e.stopPropagation()}>
        <button 
          className="quote-modal__close" 
          onClick={onClose} 
          aria-label="Close quote modal"
        >
          <X size={20} />
        </button>

        {!submitted ? (
          <>
            <div className="quote-modal__header">
              <div className="quote-modal__icon">
                <Calculator size={24} />
              </div>
              <div>
                <h2 id="quote-modal-title" className="quote-modal__title">Request a Timber Quotation</h2>
                <p className="quote-modal__subtitle">
                  Share the product, dimensions, and quantity you need. The volume shown is an estimate for your enquiry.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="quote-modal__form">
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <div className="quote-modal__grid-2">
                <div className="quote-form-group">
                  <label htmlFor="quote-clientName" className="quote-label">Full Name *</label>
                  <input
                    type="text"
                    id="quote-clientName"
                    name="clientName"
                    required
                    placeholder="e.g. Robert Vance"
                    value={formData.clientName}
                    onChange={handleChange}
                    className="quote-input"
                  />
                </div>

                <div className="quote-form-group">
                  <label htmlFor="quote-phone" className="quote-label">Phone Number *</label>
                  <input
                    type="tel"
                    id="quote-phone"
                    name="phone"
                    required
                    placeholder="Enter a contact phone number"
                    value={formData.phone}
                    onChange={handleChange}
                    className="quote-input"
                  />
                </div>
              </div>

              <div className="quote-modal__grid-2">
                <div className="quote-form-group">
                  <label htmlFor="quote-species" className="quote-label">Requested Product or Species *</label>
                  <input
                    type="text"
                    id="quote-species"
                    name="species"
                    required
                    maxLength={150}
                    placeholder="Enter the product or species you need"
                    value={formData.species}
                    onChange={handleChange}
                    className="quote-input"
                  />
                </div>

                <div className="quote-form-group">
                  <label htmlFor="quote-serviceType" className="quote-label">Requested Service</label>
                  <input
                    type="text"
                    id="quote-serviceType"
                    name="serviceType"
                    maxLength={150}
                    placeholder="Describe any processing or supply service"
                    value={formData.serviceType}
                    onChange={handleChange}
                    className="quote-input"
                  />
                </div>
              </div>

              {/* Dimensional Calculation Box */}
              <div className="quote-modal__dimensions-box">
                <span className="quote-modal__dimensions-title">Dimensional Specifications (Inches & Feet)</span>
                <div className="quote-modal__dim-row">
                  <div>
                    <label htmlFor="quote-thickness" className="quote-sublabel">Thickness (in)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.5"
                      id="quote-thickness"
                      name="thicknessInches"
                      value={formData.thicknessInches}
                      onChange={handleChange}
                      className="quote-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="quote-width" className="quote-sublabel">Width (in)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      id="quote-width"
                      name="widthInches"
                      value={formData.widthInches}
                      onChange={handleChange}
                      className="quote-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="quote-length" className="quote-sublabel">Length (ft)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      id="quote-length"
                      name="lengthFeet"
                      value={formData.lengthFeet}
                      onChange={handleChange}
                      className="quote-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="quote-qty" className="quote-sublabel">Pieces (Qty)</label>
                    <input
                      type="number"
                      min="1"
                      id="quote-qty"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleChange}
                      className="quote-input"
                    />
                  </div>
                </div>
                <div className="quote-modal__cbf-preview">
                  Estimated Volume: <strong>{calculateCbf()} Cubic Feet (CBF)</strong>
                </div>
              </div>

              <div className="quote-form-group">
                <label htmlFor="quote-notes" className="quote-label">Cutting Tolerances & Special Notes</label>
                <textarea
                  id="quote-notes"
                  name="notes"
                  rows="2"
                  placeholder="Specify moisture seasoning, surface planing, or edge profiles needed..."
                  value={formData.notes}
                  onChange={handleChange}
                  className="quote-textarea"
                ></textarea>
              </div>

              <div className="quote-modal__actions">
                <Button variant="outline" size="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  size="md" 
                  type="submit"
                  disabled={submitting}
                  icon={<ArrowRight size={16} />}
                >
                  {submitting ? 'Submitting...' : 'Submit Quote Request'}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="quote-modal__success">
            <div className="quote-modal__success-icon">
              <CheckCircle size={48} color="#137333" />
            </div>
            <h3 className="quote-modal__success-title">Quotation Inquiry Registered!</h3>
            <p className="quote-modal__success-msg">
              Thank you, <strong>{formData.clientName}</strong>. Your timber requirements have been assigned Reference ID:
            </p>
            <div className="quote-modal__ref-tag">{quoteEstimate?.referenceNo}</div>
            
            <div className="quote-modal__summary-box">
              <div className="quote-modal__summary-line">
                <span>Selected Species:</span>
                <strong>{quoteEstimate?.species}</strong>
              </div>
              <div className="quote-modal__summary-line">
                <span>Calculated Volume:</span>
                <strong>{quoteEstimate?.cbf} CBF</strong>
              </div>
              <div className="quote-modal__summary-line">
                <span>Direct Contact:</span>
                <strong>{formData.phone}</strong>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', margin: '1rem 0 1.5rem 0' }}>
              Mill staff will review your requirements and follow up with confirmed availability and pricing.
            </p>

            <Button variant="primary" size="md" onClick={resetForm} fullWidth>
              Done / Return to Mill Site
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
