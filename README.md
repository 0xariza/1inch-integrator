# 1Inch SDK Integration

A comprehensive Node.js SDK integration for 1Inch protocol, providing access to Fusion swaps, limit orders, permit functionality, and cross-chain operations.

## 🚀 Features

- **Fusion Swaps**: Execute gasless swaps using 1Inch Fusion protocol
- **Fusion Plus**: Advanced Fusion functionality with enhanced features
- **Limit Orders**: Create and manage limit orders on 1Inch orderbook
- **Permit Support**: ERC-2612 signature generation and execution
- **Permit2 Integration**: Advanced permit functionality with Uniswap Permit2
- **Cross-Chain Operations**: Support for multiple blockchain networks
- **Transaction Monitoring**: Check order status and transaction details
- **Token Approvals**: Automatic token approval management

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager
- 1Inch API key (optional for some operations)
- Web3 wallet with private key
- RPC endpoint for your target blockchain

## 🛠️ Installation

1. **Clone or navigate to the 1Inch directory:**
   ```bash
   cd 1Inch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```

4. **Configure your `.env` file:**
   ```env
   # Your wallet private key (without 0x prefix)
   PRIVATE_KEY=your_private_key_here
   
   # RPC URL for the blockchain network
   RPC_URL=your_rpc_url_here
   
   # API key for 1Inch (optional for some operations)
   API_KEY=your_1inch_api_key_here
   ```

## 📁 Project Structure

```
1Inch/
├── src/
│   ├── config.js              # Configuration and environment setup
│   ├── fusion.js              # Fusion swap implementation
│   ├── fusion_plus.js         # Fusion Plus advanced features
│   ├── limit_order.js         # Limit order creation and management
│   ├── permit.js              # ERC-2612 permit functionality
│   ├── permit2.js             # Permit2 integration and management
│   ├── check_transaction.js   # Transaction status monitoring
│   └── Permit2.json           # Permit2 ABI
├── package.json               # Dependencies and scripts
├── env.example               # Environment variables template
└── README.md                 # This file
```

## 🔧 Configuration

The main configuration is handled in `src/config.js`. Key configuration options:

- **Network Settings**: Chain IDs, RPC endpoints
- **Token Addresses**: Source and destination token addresses
- **Wallet Configuration**: Private key and wallet address
- **API Keys**: 1Inch authentication keys

## 📖 Usage Examples

### 1. Fusion Swap

Execute a gasless swap using 1Inch Fusion:

```javascript
const { executeFusionSwap } = require('./src/fusion.js');

const swapParams = {
  fromTokenAddress: "0x4200000000000000000000000000000000000006", // WETH on Base
  toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // USDC on Base
  amount: ethers.utils.parseUnits("0.001", 18).toString(),
  walletAddress: "your_wallet_address"
};

await executeFusionSwap(swapParams);
```

### 2. Limit Order

Create and submit a limit order:

```javascript
const { buildOrder, signOrder, submitOrder } = require('./src/limit_order.js');

const orderParams = {
  makerToken: "0x4200000000000000000000000000000000000006", // WETH
  takerToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  makingAmount: ethers.utils.parseUnits("0.003", 18).toString(),
  takingAmount: "40000000", // 40 USDC
  expiration: Math.floor(Date.now() / 1000) + 180, // 3 minutes
  makerAddress: walletAddress
};

const { domain, order, message, orderHash, extension } = await buildOrder(8453, orderParams);
const signature = await signOrder(domain, order, message);
const result = await submitOrder(8453, orderHash, signature, message, extension);
```

### 3. Permit Operations

#### ERC-2612 Permit (Native Token Permit)

Generate and use ERC-2612 permit signatures for gasless approvals:

```javascript
const { main } = require('./src/permit.js');

// This will automatically detect if the token supports ERC-2612 Permit
// and fall back to Permit2 if not supported
await main();
```

#### Permit2 Integration

Use Uniswap's Permit2 for advanced permit functionality:

```javascript
const { main } = require('./src/permit2.js');

// Execute Permit2-based fusion swap with gasless approval
await main();
```


#### Permit Types Overview

- **ERC-2612 Permit**: Native token permit support (if token implements it)
- **Permit2**: Universal permit system by Uniswap for all ERC-20 tokens

The SDK automatically detects the best permit method for your token and falls back gracefully.

### 4. Check Transaction Status

Monitor the status of your orders:

```javascript
const { checkTransactionStatus } = require('./src/check_transaction.js');

const orderHash = "0x109e054bb668f2acc1a4137c1a9d2ec41595e40796011898016965ed809a4f9f";
const status = await checkTransactionStatus(orderHash);
console.log('Order Status:', status);
```

## 🔗 Supported Networks

- **Ethereum Mainnet** (Chain ID: 1)
- **Base** (Chain ID: 8453)
- **Arbitrum** (Chain ID: 42161)
- **Polygon** (Chain ID: 137)
- **BSC** (Chain ID: 56)

## 🛡️ Security Features

- **Private Key Management**: Secure environment variable handling
- **Gas Estimation**: Automatic gas price calculation with buffers
- **Error Handling**: Comprehensive error catching and reporting
- **Transaction Validation**: Pre-flight transaction checks
- **Allowance Management**: Automatic token approval handling
- **Permit Security**: Secure signature generation and validation
- **Fallback Mechanisms**: Automatic fallback between permit types

## 🔐 Permit System Integration

The SDK provides comprehensive support for gasless token approvals through multiple permit systems:

### ERC-2612 Permit (Native Token Permit)
- **Purpose**: Gasless approvals for tokens that implement ERC-2612
- **Usage**: Automatic detection and usage for supported tokens
- **Benefits**: No additional contracts required, direct token integration
- **File**: `src/permit.js`

### Permit2 (Uniswap Universal Permit)
- **Purpose**: Universal permit system for all ERC-20 tokens
- **Usage**: Fallback for tokens without ERC-2612 support
- **Benefits**: Works with any ERC-20 token, advanced features
- **File**: `src/permit2.js`


### Automatic Fallback System
The SDK automatically:
1. Checks if token supports ERC-2612 permit
2. Falls back to Permit2 if native permit is not supported
3. Uses Permit3 for enhanced features when available
4. Handles signature generation and validation securely

## 📊 API Integration

### 1Inch API Endpoints Used

- **Fusion API**: `https://api.1inch.dev/fusion`
- **Fusion Plus API**: `https://api.1inch.dev/fusion-plus`
- **Orderbook API**: `https://api.1inch.dev/orderbook/v4.0`
- **Cross-Chain API**: `https://api.1inch.dev/cross-chain`

### Authentication

All API calls require a valid 1Inch API key passed in the Authorization header:
```
Authorization: Bearer YOUR_API_KEY
```

## 🔄 Dependencies

- **@1inch/fusion-sdk**: Official 1Inch Fusion SDK
- **@1inch/cross-chain-sdk**: Cross-chain functionality
- **@uniswap/permit2-sdk**: Permit2 support for universal permit functionality
- **ethers**: Ethereum library for blockchain interactions
- **web3**: Web3 library for additional functionality
- **axios**: HTTP client for API requests

## 🚨 Important Notes

1. **Private Key Security**: Never commit your private key to version control
2. **Gas Fees**: Ensure sufficient gas balance for transactions
3. **Token Approvals**: Some operations require token approvals
4. **Network Selection**: Verify you're using the correct network configuration
5. **API Rate Limits**: Be mindful of 1Inch API rate limits

## 🐛 Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure your `.env` file is properly configured
   - Check that all required variables are set

2. **"Insufficient allowance"**
   - Run token approval before executing swaps
   - Check if the token supports ERC-2612 permit functionality
   - Use Permit2 for tokens without native permit support
   - Ensure proper permit signature generation

3. **"Transaction failed"**
   - Verify sufficient gas balance
   - Check network congestion
   - Ensure correct token addresses

4. **"API Error"**
   - Verify your 1Inch API key is valid
   - Check API rate limits
   - Ensure correct endpoint URLs

5. **"Permit signature failed"**
   - Verify token supports the permit type you're using
   - Check signature deadline hasn't expired
   - Ensure correct nonce values for Permit2
   - Verify permit data encoding is correct

### Debug Mode

Enable debug logging by setting environment variables:
```bash
DEBUG=1inch:* npm run your-script
```

## 📝 License

This project is part of the Vaultera SDKs collection. Please refer to the main project license for usage terms.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section above
- Review 1Inch documentation: https://docs.1inch.io/
- Open an issue in the repository

---

**Disclaimer**: This SDK is for educational and development purposes. Always test thoroughly on testnets before using on mainnet. Use at your own risk. 
