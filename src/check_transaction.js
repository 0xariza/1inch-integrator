const axios = require("axios");

// Configuration for this file
const config = {
    authKey: process.env.AUTH_KEY
};

// Validate required environment variables
if (!config.authKey) {
    throw new Error("AUTH_KEY environment variable is required");
}

/**
 * Check the status of a 1inch Fusion Plus order
 * @param {string} orderHash - The hash of the order to check
 * @returns {Promise<Object>} The order status response
 */
async function checkOrderStatus(orderHash) {
  const url = `https://api.1inch.dev/fusion-plus/orders/v1.0/order/status/${orderHash}`;

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${config.authKey}`,
    },
    params: {},
    paramsSerializer: {
      indexes: null,
    },
  };

  try {
    const response = await axios.get(url, axiosConfig);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data}`);
    } else if (error.request) {
      throw new Error('No response received from server');
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }
}

// Example usage
async function checkTransactionStatus(orderHash) {
  try {
    const status = await checkOrderStatus(orderHash);
    console.log('Order Status:', status);
    return status;
  } catch (error) {
    console.error('Error checking order status:', error.message);
    throw error;
  }
}

// Export the function so it can be used in other files
module.exports = {
  checkTransactionStatus,
  checkOrderStatus
};

// If you want to run this file directly
if (require.main === module) {
  // Example order hash - replace with your actual order hash
  const orderHash = "0x109e054bb668f2acc1a4137c1a9d2ec41595e40796011898016965ed809a4f9f";
  checkTransactionStatus(orderHash)
    .then(console.log)
    .catch(console.error);
} 