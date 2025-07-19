const Web3 = require("web3").default;
const { ethers } = require("ethers");
const axios = require("axios");

const {
  SDK,
  PrivateKeyProviderConnector,
  NetworkEnum,
  HashLock,
  PresetEnum,
  OrderStatus,
} = require("@1inch/cross-chain-sdk");
const { randomBytes } = require("crypto");

// Configuration for this file
const config = {
    walletAddress: "0xaE87F9BD09895f1aA21c5023b61EcD85Eba515D1",
    srcChain: "8453",
    dstChain: "1",
    srcTokenAddress: "0x4200000000000000000000000000000000000006",
    dstTokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    amount: ethers.utils.parseUnits("0.002", 18),
    enableEstimate: "true",
    provider: process.env.ALCHEMY_API_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : null,
    privateKey: process.env.PRIVATE_KEY,
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

// ERC20 ABI for allowance functions
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

const privateKey = config.privateKey;
const rpc = config.provider;
const authKey = config.authKey;
const source = "sdk-tutorial";

const web3 = new Web3(rpc);
const walletAddress = web3.eth.accounts.privateKeyToAccount(privateKey).address;

// Create ethers provider and wallet
const ethersProvider = new ethers.providers.JsonRpcProvider(rpc);
const ethersWallet = new ethers.Wallet(privateKey, ethersProvider);

const sdk = new SDK({
  url: "https://api.1inch.dev/fusion-plus",
  authKey,
  blockchainProvider: ethersProvider,
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkAndSetAllowance(tokenAddress, spenderAddress, amount) {
  console.log(`Checking allowance for ${tokenAddress} to spender ${spenderAddress}`);
  
  // Create contract instance using ethers
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersWallet);
  
  // Check current allowance
  const currentAllowance = await tokenContract.allowance(walletAddress, spenderAddress);
  console.log(`Current allowance: ${currentAllowance.toString()}`);
  
  // If allowance is insufficient, approve
  if (currentAllowance.lt(amount)) {
    console.log(`Setting approval for ${tokenAddress}`);
    
    // Define approval amount - approve a large amount to avoid future approvals
    const approvalAmount = ethers.constants.MaxUint256;
    
    // Create and send approval transaction
    const approveTx = await tokenContract.approve(spenderAddress, approvalAmount, {
      gasLimit: 100000,
      gasPrice: await ethersProvider.getGasPrice()
    });
    
    console.log(`Approval transaction sent: ${approveTx.hash}`);
    console.log(`Waiting for approval confirmation...`);
    
    // Wait for confirmation
    const approveReceipt = await approveTx.wait(1);
    console.log(`Approval confirmed in block ${approveReceipt.blockNumber}`);
    
    return true;
  } else {
    console.log(`Token allowance is sufficient`);
    return false;
  }
}

/**
 * Check the status of a 1inch Fusion Plus order
 * @param {string} orderHash - The hash of the order to check
 * @param {string} authKey - The authentication key for the 1inch API
 * @returns {Promise<Object>} The order status response
 */
async function checkOrderStatus(orderHash, authKey) {
  const url = `https://api.1inch.dev/fusion-plus/orders/v1.0/order/status/${orderHash}`;

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
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      throw new Error(`API Error: ${error.response.status} - ${error.response.data}`);
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response received from server');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Request Error: ${error.message}`);
    }
  }
}

async function main() {
  // estimate
  const quote = await sdk.getQuote({
    amount: config.amount,
    srcChainId: NetworkEnum.COINBASE,
    dstChainId: NetworkEnum.ETHEREUM,
    enableEstimate: true,
    srcTokenAddress: config.srcTokenAddress,
    dstTokenAddress: config.dstTokenAddress,
    walletAddress,
  });

  //agragator v6 address of oneInch
  const allowanceTarget = "0x111111125421cA6dc452d289314280a0f8842A65";

  // Check and set allowance before proceeding
  await checkAndSetAllowance(
    config.srcTokenAddress,
    allowanceTarget, // This is the spender address that needs approval
    config.amount
  );

  const preset = PresetEnum.fast;

  // generate secrets
  const secrets = Array.from({
    length: quote.presets[preset].secretsCount,
  }).map(() => "0x" + randomBytes(32).toString("hex"));

  const hashLock =
    secrets.length === 1
      ? HashLock.forSingleFill(secrets[0])
      : HashLock.forMultipleFills(HashLock.getMerkleLeaves(secrets));

  const secretHashes = secrets.map((s) => HashLock.hashSecret(s));

  await sleep(1000);
  // create order
  const { hash, quoteId, order } = await sdk.createOrder(quote, {
    walletAddress,
    hashLock,
    preset,
    source,
    secretHashes,
  });
  console.log({ hash }, "order created");

  await sleep(1000);
  // submit order
  const _orderInfo = await sdk.submitOrder(
    quote.srcChainId,
    order,
    quoteId,
    secretHashes
  );
  console.log({ hash }, "order submitted");

  // submit secrets for deployed escrows
  while (true) {
    await sleep(1000);
    const secretsToShare = await sdk.getReadyToAcceptSecretFills(hash);
    if (secretsToShare.fills.length) {
      for (const { idx } of secretsToShare.fills) {
        console.log("idx", idx);
        await sleep(1000);
        await sdk.submitSecret(hash, secrets[idx]);

        console.log({ idx }, "shared secret");
      }
    }
    await sleep(1000);
    // check if order finished
    const { status } = await sdk.getOrderStatus(hash);

    if (
      status === OrderStatus.Executed ||
      status === OrderStatus.Expired ||
      status === OrderStatus.Refunded
    ) {
      break;
    }
  }
  await sleep(1000);
  const statusResponse = await sdk.getOrderStatus(hash);

  console.log("statusResponse", statusResponse);

  // After creating and submitting the order, you can check its status
  try {
    const orderStatus = await checkOrderStatus(hash, authKey);
    console.log('Order Status:', orderStatus);
  } catch (error) {
    console.error('Error checking order status:', error.message);
  }
}

main();
