import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import { getPublicProducts } from '../services/publicEnquiry';
import { formatCurrency } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { getLocalizedWoodName, isWoodNameVerified } from '../i18n/woodSpecies';
import './ProductDetails.css';

export default function ProductDetails({ onOpenQuote }) {
  const { t, language } = useLanguage();
  const { id } = useParams();
  const [result, setResult] = useState({ id: null, product: null, error: '' });
  const loading = result.id !== id;
  const product = loading ? null : result.product;
  const error = loading ? '' : result.error;

  useEffect(() => {
    let mounted = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    getPublicProducts()
      .then((items) => {
        if (mounted) {
          setResult({ id, product: items.find((item) => item.id === id) || null, error: '' });
        }
      })
      .catch((loadError) => {
        if (mounted) setResult({ id, product: null, error: loadError.message || 'Could not load this wood item. Please try again.' });
      })
    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return <div className="product-details-page"><div className="container" role="status">Loading product details...</div></div>;
  }
  if (error) {
    return (
      <div className="product-details-page">
        <div className="container products-empty-state" role="alert">
          <h2>Product details could not be loaded</h2>
          <p>{error}</p>
          <Link to="/products">Return to available products</Link>
        </div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="product-details-page">
        <div className="container products-empty-state">
          <h2>Product is not currently available</h2>
          <p>This wood may have been sold or is no longer available.</p>
          <Link to="/products">Browse available products</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="product-details-page">
      <PageHeader
        eyebrow={product.category}
        title={product.name}
        subtitle={getLocalizedWoodName(product, t, language)}
        breadcrumbs={[{ label: 'Products', link: '/products' }, { label: product.name }]}
        badge="Currently available"
      />
      <section className="product-details-section">
        <div className="container">
          <div className="card">
            <h2>Wood Details</h2>
            <dl>
              <dt>Species</dt><dd>
                {getLocalizedWoodName(product, t, language)}
                {product.common_name_en && product.common_name_en !== getLocalizedWoodName(product, t, language) &&
                  <> ({product.common_name_en})</>}
              </dd>
              {!isWoodNameVerified(product, language) && <><dt>Name check</dt><dd>Local name not yet verified</dd></>}
              {product.scientific_name && <><dt>Scientific name</dt><dd>
                {product.scientific_name}{product.scientific_name_verified ? '' : ' (not verified)'}
              </dd></>}
              <dt>Category</dt><dd>{product.category}</dd>
              {product.grade && <><dt>Grade</dt><dd>{product.grade}</dd></>}
              {product.dimensions_text && <><dt>Dimensions</dt><dd>{product.dimensions_text}</dd></>}
              <dt>Unit</dt><dd>{product.unit}</dd>
              {product.indicativePrice != null && (
                <><dt>Price</dt><dd>{formatCurrency(product.indicativePrice)} / {product.unit}</dd></>
              )}
              <dt>Availability</dt><dd>{product.availability}</dd>
            </dl>
            <Button
              type="button"
              variant="primary"
              size="md"
              icon={<ArrowRight size={16} />}
              onClick={() => onOpenQuote?.(product.name)}
            >
              Ask for a Price
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
