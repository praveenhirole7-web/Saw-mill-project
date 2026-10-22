import { apiRequest } from './apiClient';

export async function submitPublicEnquiry(enquiry) {
  const result = await apiRequest({
    url: '/api/v1/enquiries/public',
    method: 'POST',
    data: enquiry
  });
  if (!result.success || !result.data?.reference) {
    throw new Error('The server did not confirm that your enquiry was saved.');
  }
  return result.data;
}

export async function getPublicProducts(params = {}) {
  const result = await apiRequest({
    url: '/api/v1/catalog/products',
    method: 'GET',
    params
  });
  return (result.data?.items || []).map((product) => ({
    ...product,
    image: product.image_url || undefined
  }));
}
