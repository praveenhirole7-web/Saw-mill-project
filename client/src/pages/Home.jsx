import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CheckCircle2, Ruler, Tag } from 'lucide-react';
import Button from '../components/common/Button';
import { getPublicProducts } from '../services/publicEnquiry';
import { formatCurrency } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { getLocalizedWoodName, isWoodNameVerified } from '../i18n/woodSpecies';
import './Home.css';

export default function Home() {
  const { t, language } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(() => {
    getPublicProducts()
      .then((items) => { setProducts(items.slice(0, 6)); setError(''); })
      .catch(() => setError('The wood list is not available right now. Please try again later.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <div className="homepage-wrapper">
      <section className="hero-section" aria-labelledby="home-hero-title">
        <div
          className="hero-section__bg"
          style={{ backgroundImage: "url('/images/hero-banner.jpg')" }}
          aria-hidden="true"
        />
        <div className="hero-section__overlay" aria-hidden="true" />
        <div className="container hero-section__container">
          <div className="hero-section__content">
            <span className="hero-section__tag">
              <CheckCircle2 size={16} aria-hidden="true" />
              Wood available now and custom cutting work
            </span>
            <h1 id="home-hero-title" className="hero-section__heading">
              Wood for your work, cut to size.
            </h1>
            <p className="hero-section__lead">
              Browse wood available now, or tell us the type, size and cutting work you need.
            </p>
            <div className="hero-section__cta-group">
              <Link to="/products">
                <Button variant="white" size="md" icon={<ArrowRight size={17} />}>
                  See Wood for Sale
                </Button>
              </Link>
              <Link to="/quote">
                <Button variant="ghost" size="md">
                  Ask for a Price
                </Button>
              </Link>
            </div>
            <div className="hero-section__proof" aria-label="Mill services">
              <span>Finished wood</span>
              <span>Wood cut to size</span>
              <span>Help from our mill team</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header text-center">
            <h2 className="section-title">Wood Available Now</h2>
            <p className="section-subtitle">This list shows wood currently available from our mill. It may change as stock is sold or added.</p>
          </div>

          {error && (
            <div className="products-empty-state" role="alert">
              <h3>Wood list could not be loaded</h3>
              <p>{error}</p>
              <Button variant="outline" size="md" onClick={() => { setLoading(true); loadProducts(); }}>Try Again</Button>
            </div>
          )}
          {loading ? <p role="status">Loading wood list...</p> : null}
          {!loading && !error && products.length === 0 ? (
            <div className="products-empty-state"><p>No finished wood is available right now.</p></div>
          ) : null}
          {!loading && !error && products.length > 0 && (
            <div className="home-catalog-grid">
              {products.map((product) => (
                <article className="product-listing-card" key={product.id}>
                  <div className="product-listing-card__media">
                    <img
                      src={product.image || '/images/timber-boards.jpg'}
                      alt={`${product.name} timber`}
                      className="product-listing-card__img"
                      loading="lazy"
                    />
                    <div className="product-listing-card__badges">
                      <span className="product-category-tag">{product.category}</span>
                      <span className="product-availability-tag">{product.availability}</span>
                    </div>
                  </div>
                  <div className="product-listing-card__body">
                    <div className="product-listing-card__head">
                      <h3 className="product-listing-card__title">
                        <Link to={`/products/${encodeURIComponent(product.id)}`} className="product-title-link">
                          {product.name}
                        </Link>
                      </h3>
                      <span className="product-listing-card__botanical">
                        {getLocalizedWoodName(product, t, language)}
                        {product.common_name_en && product.common_name_en !== getLocalizedWoodName(product, t, language) &&
                          <small> ({product.common_name_en})</small>}
                      </span>
                    </div>
                    {!isWoodNameVerified(product, language) && <small>* Local name not yet verified</small>}
                    {product.scientific_name && <small className="product-listing-card__botanical">
                      {product.scientific_name}{product.scientific_name_verified ? '' : ' (not verified)'}
                    </small>}
                    {product.grade && <p className="product-listing-card__desc">Grade: {product.grade}</p>}
                    <div className="product-listing-card__meta-list">
                      {product.dimensions_text && (
                        <div className="product-meta-row">
                          <Ruler size={14} className="product-meta-icon" aria-hidden="true" />
                          <span><strong>Dimensions:</strong> {product.dimensions_text}</span>
                        </div>
                      )}
                      {product.indicativePrice != null && (
                        <div className="product-meta-row product-meta-row--price">
                          <Tag size={14} className="product-meta-icon" aria-hidden="true" />
                          <span><strong>Price:</strong> {formatCurrency(product.indicativePrice)} / {product.unit}</span>
                        </div>
                      )}
                    </div>
                    <div className="product-listing-card__actions">
                      <Link to={`/products/${encodeURIComponent(product.id)}`} className="product-action-btn-wrap">
                        <Button variant="outline" size="sm" fullWidth icon={<ArrowRight size={15} />}>
                          View details
                        </Button>
                      </Link>
                      <Link to={`/quote?product=${encodeURIComponent(product.name)}`} className="product-action-btn-wrap">
                        <Button variant="wood" size="sm" fullWidth icon={<ArrowUpRight size={15} />}>
                          Ask for a Price
                        </Button>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="section">
        <div className="container text-center">
          <h2 className="section-title">Need a different size or type?</h2>
          <p className="section-subtitle">Send us a message. We will confirm when your request has been saved.</p>
          <Link to="/contact"><Button variant="wood" size="md">Contact the Mill</Button></Link>
        </div>
      </section>
    </div>
  );
}
