import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the API key from the request headers
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get the OpenAI endpoint from the query params, with a default fallback
    const endpoint = req.query.endpoint as string || 'https://api.openai.com/v1/chat/completions';
    
    console.log(`Proxying request to: ${endpoint}`);
    
    // Make the request to OpenAI
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });
    
    console.log(`OpenAI response status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    // Check if the response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Not JSON, likely an error page or redirect
      const text = await response.text();
      console.error(`Non-JSON response received: ${text.substring(0, 200)}...`);
      
      return res.status(500).json({
        error: 'Invalid response from API',
        message: 'The API returned a non-JSON response',
        statusCode: response.status,
        statusText: response.statusText,
        hint: 'Please check your API endpoint URL for typos. It should be exactly "https://api.openai.com/v1/chat/completions" for OpenAI.'
      });
    }

    // Get the response data
    const data = await response.json();
    
    // Check for API errors and include them in the response
    if (!response.ok) {
      console.error('API error from OpenAI:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Unknown API error',
        details: data
      });
    }

    // Return the response from OpenAI
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from OpenAI API',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 