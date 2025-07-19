const Web3 = require("web3").default;
const { ethers } = require("ethers");
const axios = require("axios");

// Configuration for this file
const config = {
    privateKey: process.env.PRIVATE_KEY,
    provider: process.env.ALCHEMY_API_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : null,
    authKey: process.env.AUTH_KEY
};

// Validate required environment variables
if (!config.privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
}
if (!config.provider) {
    throw new Error("ALCHEMY_API_KEY environment variable is required");
}
if (!config.authKey) {
    throw new Error("AUTH_KEY environment variable is required");
}

// Web3 setup
const web3 = new Web3(config.provider);
const walletAddress = web3.eth.accounts.privateKeyToAccount(config.privateKey).address;
// Ethers setup for token interactions
const ethersProvider = new ethers.providers.JsonRpcProvider(config.provider);
const ethersWallet = new ethers.Wallet(config.privateKey, ethersProvider);

// Utility functions
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildOrder(chainId, params) {
  const url = `https://api.1inch.dev/orderbook/v4.0/${chainId}/build`;

  const req = {
    headers: {
      Authorization: `Bearer ${config.authKey}`,
    },
    params: params,
    paramsSerializer: {
      indexes: null,
    },
  };

  try {
    const response = await axios.get(url, req);

    return {
      domain: response.data.typedData.domain,
      order: response.data.typedData.types.Order,
      message: response.data.typedData.message,
      orderHash: response.data.orderHash,
      extension: response.data.extension,
    };
  } catch (error) {
    console.error(error);
  }
}
async function signOrder(domain, order, message) {
  const signature = await ethersWallet._signTypedData(
    domain,
    { Order: order },
    message
  );
  return signature;
}
async function submitOrder(chainId, orderHash, signature, message, extension) {
  const postUrl = `https://api.1inch.dev/orderbook/v4.0/${chainId}`;
  const Postconfig = {
    headers: {
      Authorization: `Bearer ${config.authKey}`,
    },
    params: {},
    paramsSerializer: {
      indexes: null,
    },
  };
  const body = {
    orderHash,
    signature,
    data: {
      ...message,
      extension,
    },
  };

  const postRes = await axios.post(postUrl, body, Postconfig);
  return postRes.data;
}

async function checkOrderStatusHTTP(chainId, orderHash, authKey) {
  const url = `https://api.1inch.dev/orderbook/v4.0/${chainId}/order/${orderHash}`;

  const config = {
    headers: {
      Authorization: `Bearer ${authKey}`,
    },
    params: {},
    paramsSerializer: {
      indexes: null,
    },
  };

  try {
    const response = await axios.get(url, config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `API Error: ${error.response.status} - ${JSON.stringify(
          error.response.data
        )}`
      );
    } else if (error.request) {
      throw new Error("No response received from server");
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }
}
/**
 * Main execution function
 */
async function main() {
  const chainId = 8453;

  const buildOrderParams = {
    makerToken: "0x4200000000000000000000000000000000000006",
    takerToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    makingAmount: ethers.utils.parseUnits("0.003", 18).toString(),
    takingAmount: "40000000",
    expiration: Math.floor(Date.now() / 1000) + 180, // 3 min,
    makerAddress: walletAddress,
  };

  try {
    console.log("building order ...");

    const { domain, order, message, orderHash, extension } = await buildOrder(
      chainId,
      buildOrderParams
    );
    console.log("order built and orderHash is:", orderHash);
    console.log("signing order ...");
    await sleep(2000);
    const signature = await signOrder(domain, order, message);
    console.log("signature is: ", signature);
    console.log("submitting order ...");
    await sleep(2000);
    const orderSubmissionResult = await submitOrder(
      chainId,
      orderHash,
      signature,
      message,
      extension
    );

    await sleep(2000);
    if (orderSubmissionResult.success) {
      console.log("order submitted ...");

      await sleep(2000);
      const limitOrderData = await checkOrderStatusHTTP(
        chainId,
        orderHash,
        config.authKey
      );

      console.log("limit order data is", limitOrderData);
    }
  } catch (error) {
    console.error(`Main execution failed:`, error.message);
    console.error(error.stack);
  }
}

// Export functions for modular use
module.exports = {
  buildOrder,
  submitOrder,
  signOrder,
  checkOrderStatusHTTP,
  sleep,
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}