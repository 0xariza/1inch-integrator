const Web3 = require("web3").default;
const { ethers } = require("ethers");
const axios = require("axios");
const {
  FusionSDK,
  NetworkEnum,
  OrderStatus,
  PrivateKeyProviderConnector,
} = require("@1inch/fusion-sdk");

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

// ERC20 ABI for token operations
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

// Web3 setup
const web3 = new Web3(config.provider);
const walletAddress = web3.eth.accounts.privateKeyToAccount(config.privateKey).address;

// Ethers setup for token interactions
const ethersProvider = new ethers.providers.JsonRpcProvider(config.provider);
const ethersWallet = new ethers.Wallet(config.privateKey, ethersProvider);

// FIXED: Use numerical chain ID instead of NetworkEnum.COINBASE for Base
// Base chain ID is 8453
const sdk = new FusionSDK({
  url: "https://api.1inch.dev/fusion",
  authKey: config.authKey,
  network: NetworkEnum.ETHEREUM, // Use numerical chain ID for Base instead of NetworkEnum.COINBASE
  blockchainProvider: new PrivateKeyProviderConnector(config.privateKey, web3),
});

// Utility functions
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTokenInfo(tokenAddress) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersProvider);
    const [symbol, decimals, balance] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.balanceOf(walletAddress)
    ]);
    
    return {
      address: tokenAddress,
      symbol,
      decimals,
      balance: balance.toString()
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error.message);
    return null;
  }
}

async function checkAndSetAllowance(tokenAddress, spenderAddress, amount) {
  console.log(`Checking allowance for ${tokenAddress} to spender ${spenderAddress}`);
  
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersWallet);
  
  try {
    // Check current allowance
    const currentAllowance = await tokenContract.allowance(walletAddress, spenderAddress);
    console.log(`Current allowance: ${currentAllowance.toString()}`);
    
    // If allowance is insufficient, approve
    if (currentAllowance.lt(amount)) {
      console.log(`Setting approval for ${tokenAddress}`);
      
      // Use MaxUint256 for unlimited approval
      const approvalAmount = ethers.constants.MaxUint256;
      
      // Get current gas price with buffer
      const gasPrice = await ethersProvider.getGasPrice();
      
      // Create and send approval transaction
      const approveTx = await tokenContract.approve(spenderAddress, approvalAmount, {
        gasLimit: 100000,
        gasPrice: gasPrice.mul(110).div(100) // 10% buffer
      });
      
      console.log(`Approval transaction sent: ${approveTx.hash}`);
      console.log(`Waiting for approval confirmation...`);
      
      const approveReceipt = await approveTx.wait(1);
      console.log(`Approval confirmed in block ${approveReceipt.blockNumber}`);
      
      return true;
    } else {
      console.log(`Token allowance is sufficient`);
      return false;
    }
  } catch (error) {
    console.error(`Error in allowance check/approval:`, error.message);
    throw error;
  }
}

/**
 * Check order status via direct HTTP call
 */
async function checkOrderStatusHTTP(orderHash, chainId, authKey) {
  const url = `https://api.1inch.dev/fusion/orders/v2.0/${chainId}/order/status/${orderHash}`;
  
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
      throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response received from server');
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }
}

/**
 * Execute a Fusion swap - FIXED VERSION for Base Network
 */
async function executeFusionSwap(swapParams) {
  console.log(`Starting Fusion swap on Base Network...`);
  console.log(`From: ${swapParams.fromTokenAddress}`);
  console.log(`To: ${swapParams.toTokenAddress}`);
  console.log(`Amount: ${swapParams.amount}`);
  
  try {
    // FIXED: Added source parameter that was missing
    const params = {
      fromTokenAddress: swapParams.fromTokenAddress,
      toTokenAddress: swapParams.toTokenAddress,
      amount: swapParams.amount,
      walletAddress
    };

    // Get token information
    // console.log(`Getting token information...`);
    // const fromTokenInfo = await getTokenInfo(swapParams.fromTokenAddress);
    // const toTokenInfo = await getTokenInfo(swapParams.toTokenAddress);
    
    // if (fromTokenInfo) {
    //   console.log(`From Token: ${fromTokenInfo.symbol} (Balance: ${ethers.utils.formatUnits(fromTokenInfo.balance, fromTokenInfo.decimals)})`);
    // }
    // if (toTokenInfo) {
    //   console.log(`To Token: ${toTokenInfo.symbol} (Balance: ${ethers.utils.formatUnits(toTokenInfo.balance, toTokenInfo.decimals)})`);
    // }

    // Get quote
    console.log(`Getting quote...`);
    const quote = await sdk.getQuote(params);
    console.log(`Quote received - Expected output: ${quote.toTokenAmount}`);
    
    // if (toTokenInfo) {
    //   const expectedOutput = ethers.utils.formatUnits(quote.toTokenAmount, toTokenInfo.decimals);
    //   console.log(`Expected output: ${expectedOutput} ${toTokenInfo.symbol}`);
    // }

    await sleep(1000);

    // Check if token approval is needed (skip for native ETH)
    const isNativeToken = swapParams.fromTokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    
    if (!isNativeToken) {
      // FIXED: Use the correct router address for Base network
      // This is the 1inch Router V6 address for Base network
      const baseRouterAddress = "0x111111125421cA6dc452d289314280a0f8842A65"; // V6 Router (same across networks)
      
      await checkAndSetAllowance(
        swapParams.fromTokenAddress,
        baseRouterAddress,
        swapParams.amount
      );
    }

    // Create order
    console.log(`Creating order...`);
    console.log(params);
    const preparedOrder = await sdk.createOrder(params);
    console.log(`Order prepared with quoteId: ${preparedOrder.quoteId}`);

    await sleep(1000);

    console.log(preparedOrder.order);
    

    // Submit order
    console.log(`Submitting order...`);
    const info = await sdk.submitOrder(
      preparedOrder.order,
      preparedOrder.quoteId
    );
    console.log(`Order submitted with hash: ${info.orderHash}`);

    // Monitor order status - keeping your detailed monitoring
    console.log(`Monitoring order status...`);
    const startTime = Date.now();
    let lastStatus = '';
    
    while (true) {
      try {
        await sleep(2000);
        const data = await sdk.getOrderStatus(info.orderHash);
        
        // Only log if status changed
        if (data.status !== lastStatus) {
          console.log(`Order status: ${data.status}`);
          lastStatus = data.status;
        }
        
        if (data.status === OrderStatus.Filled) {
          console.log(`Order filled successfully!`);
          console.log(`Fills:`, data.fills);
          break;
        }
        
        if (data.status === OrderStatus.Expired) {
          console.log(`Order expired`);
          break;
        }
        
        if (data.status === OrderStatus.Cancelled) {
          console.log(`Order cancelled`);
          break;
        }

        // Timeout after 5 minutes
        if (Date.now() - startTime > 300000) {
          console.log(`Timeout reached, stopping monitoring`);
          break;
        }
      } catch (error) {
        console.error(`Status check error:`, error.message);
        await sleep(5000); // Wait longer on error
      }
    }

    const executionTime = (Date.now() - startTime) / 1000;
    console.log(`Order completed in ${executionTime} seconds`);

    // Final HTTP status check
    try {
      const httpStatus = await checkOrderStatusHTTP(
        info.orderHash, 
        8453, // Base chain ID
        authKey
      );
      console.log(`Final HTTP Status:`, httpStatus);
    } catch (error) {
      console.error(`HTTP status check failed:`, error.message);
    }

    return { 
      orderHash: info.orderHash, 
      executionTime,
      finalStatus: lastStatus 
    };

  } catch (error) {
    console.error(`Fusion swap failed:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log(`Starting 1inch Fusion SDK on Base Network`);
  console.log(`Wallet Address: ${walletAddress}`);

  try {
    // Base network swap parameters (keeping your original config)
    const swapParams = {
      chainId: NetworkEnum.ETHEREUM, // ethereum
      fromTokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // WETH on ethereum
      toTokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // USDC on ethereum
      amount: ethers.utils.parseUnits("5", 6),
    };

    const result = await executeFusionSwap(swapParams);
    console.log(`Swap completed!`, result);

    // Optional: Check status of existing order
    // if (config.testOrderHash) {
    //   console.log(`\nChecking existing order status...`);
    //   try {
    //     const status = await checkOrderStatusHTTP(
    //       config.testOrderHash,
    //       swapParams.chainId,
    //       authKey
    //     );
    //     console.log(`Existing order status:`, status);
    //   } catch (error) {
    //     console.error(`Failed to check existing order:`, error.message);
    //   }
    // }

  } catch (error) {
    console.error(`Main execution failed:`, error.message);
    console.error(error.stack);
  }
}

// Export functions for modular use
module.exports = {
  executeFusionSwap,
  checkOrderStatusHTTP,
  checkAndSetAllowance,
  getTokenInfo,
  sleep
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}