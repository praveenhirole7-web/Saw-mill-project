import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ArrowUpRight, Eye, Ruler, Tag } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import { getPublicProducts } from '../services/publicEnquiry';
import { formatCurrency } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { getLocalizedWoodName, isWoodNameVerified } from '../i18n/woodSpecies';
import SeoMeta from '../components/common/SeoMeta';
import './Products.css';

export default function Products() {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || 'All';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [products, setProducts] = useState([]);
  const [serverSearchResults, setServerSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    getPublicProducts()
      .then((items) => { if (mounted) { setProducts(items); setError(''); } })
      .catch(() => { if (mounted) setError('The wood list is not available right now. Please try again later.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const search = searchQuery.trim();
    if (!search) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      getPublicProducts({ search })
        .then((items) => {
          if (active) {
            setServerSearchResults(items);
            setError('');
          }
        })
        .catch((searchError) => {
          if (active) setError('We could not search the wood list. Please try again.');
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const categories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const sourceProducts = searchQuery.trim() ? serverSearchResults || products : products;
    return sourceProducts.filter((product) => {
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.species || '').toLowerCase().includes(query) ||
        (product.scientific_name || '').toLowerCase().includes(query) ||
        (product.names || []).some(({ name }) => name.toLowerCase().includes(query)) ||
        (product.grade || '').toLowerCase().includes(query) ||
        (product.dimensions_text || '').toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [products, serverSearchResults, selectedCategory, searchQuery]);

  const handleCategoryChange = (cat) => {
    setSelectedCategory(cat);
    if (cat === 'All') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', cat);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="products-page">
      <SeoMeta
        title="Wood for sale"
        description="Browse TimberCraft Saw Mill wood inventory, dimensions, and premium timber stock available for purchase and custom milling."
        path="/products"
      />
      <PageHeader 
        eyebrow="Wood for Sale"
        title="Wood available now"
        subtitle="Choose the wood you need. Use the search box and simple filters to find the right option quickly."
        breadcrumbs={[{ label: 'Products' }]}
        badge="Ready to buy"
      />

      <section className="products-catalog-section">
        <div className="container">
          
          {/* Controls Bar: Search & Category Pills */}
          <div className="products-controls">
            
            {/* Search Input */}
            <div className="products-search-box">
              <Search size={18} className="products-search-icon" />
              <input
                type="text"
                placeholder="Search wood, size, or type"
                value={searchQuery}
                onChange={(e) => {
                  setServerSearchResults(null);
                  setSearchQuery(e.target.value);
                }}
                className="products-search-input"
                aria-label="Search wood products"
              />
              {searchQuery && (
                <button 
                  type="button" 
                  onClick={() => setSearchQuery('')} 
                  className="products-search-clear"
                  aria-label="Clear search"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="products-categories-scroll" role="tablist" aria-label="Product categories">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`category-pill ${selectedCategory === cat ? 'category-pill--active' : ''}`}
                >
                  {cat}
                </button>
              ))}
            </div>

          </div>

          {error && (
            <div className="products-empty-state" role="alert">
              <h3>Products could not be loaded</h3>
              <p>{error}</p>
              <Button variant="outline" size="md" onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          )}

          {/* Results Summary */}
          <div className="products-results-bar">
          <span role={loading ? 'status' : undefined}>
            {loading ? 'Loading wood list...' : `Showing ${filteredProducts.length} option${filteredProducts.length !== 1 ? 's' : ''}`}
          </span>
            {selectedCategory !== 'All' && (
              <span className="products-active-filter">
                Category: <strong>{selectedCategory}</strong>
                <button type="button" onClick={() => handleCategoryChange('All')} aria-label="Reset filter">&times;</button>
              </span>
            )}
          </div>

          {/* Product Cards Grid */}
          {!loading && !error && filteredProducts.length > 0 ? (
            <div className="products-grid">
              {filteredProducts.map((product) => (
                <article key={product.id} className="product-listing-card">
                  
                  {/* Image Container */}
                  <div className="product-listing-card__media">
                    <img
                      src={product.image || '/images/timber-boards.jpg'}
                      alt={`${product.name} timber available from TimberCraft Saw Mill`}
                      className="product-listing-card__img"
                      loading="lazy"
                    />
                    <div className="product-listing-card__badges">
                      <span className="product-category-tag">{product.category}</span>
                      <span className="product-availability-tag">{product.availability}</span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="product-listing-card__body">
                    <div className="product-listing-card__head">
                      <h3 className="product-listing-card__title">
                        <Link to={`/products/${product.id}`} className="product-title-link">
                          {product.name}
                        </Link>
                      </h3>
                      <span className="product-listing-card__botanical">
                        {getLocalizedWoodName(product, t, language)}
                        {product.common_name_en && product.common_name_en !== getLocalizedWoodName(product, t, language) &&
                          <small> ({product.common_name_en})</small>}
                      </span>
                      {!isWoodNameVerified(product, language) && <small>* Local name not yet verified</small>}
                    </div>
                    {product.scientific_name && <small className="product-listing-card__botanical">
                      {product.scientific_name}{product.scientific_name_verified ? '' : ' (not verified)'}
                    </small>}

                    {product.grade && <p className="product-listing-card__desc">Grade: {product.grade}</p>}

                    {/* Dimensions & Specifications */}
                    <div className="product-listing-card__meta-list">
                      {product.dimensions_text && <div className="product-meta-row">
                        <Ruler size={14} className="product-meta-icon" />
                        <span><strong>Dimensions:</strong> {product.dimensions_text}</span>
                      </div>}
                      {product.indicativePrice != null && (
                        <div className="product-meta-row product-meta-row--price">
                          <Tag size={14} className="product-meta-icon" />
                          <span><strong>Price:</strong> {formatCurrency(product.indicativePrice)} / {product.unit}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions: View Details and Request a Quote */}
                    <div className="product-listing-card__actions">
                      <Link to={`/products/${product.id}`} className="product-action-btn-wrap">
                        <Button variant="outline" size="sm" fullWidth icon={<Eye size={15} />}>
                          View Details
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
          ) : !loading && !error ? (
            <div className="products-empty-state">
              <h3>No wood found</h3>
              <p>Try another search or check again later. We may have more wood available soon.</p>
              <Button 
                variant="outline" 
                size="md" 
                onClick={() => {
                  setSearchQuery('');
                  handleCategoryChange('All');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}

          {/* Custom Milling Assistance Callout */}
          <div className="products-custom-callout">
            <div>
              <h3>Need a special size or wood type?</h3>
              <p>Tell us the wood type, size, and quantity you need. We will help with the next step.</p>
            </div>
            <Link to="/quote">
              <Button variant="primary" size="md">
                Ask for a custom price
              </Button>
            </Link>
          </div>

        </div>
      </section>
    </div>
  );
}
