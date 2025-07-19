const { SignatureTransfer, PERMIT2_ADDRESS, AllowanceProvider, AllowanceTransfer } = require('@uniswap/permit2-sdk');
const { ethers } = require("ethers");
const fusionSDK = require("@1inch/fusion-sdk");
const axios = require("axios");
const PERMIT2_ABI = require("./Permit2.json");

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

async function main() {
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const cbBTC = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // cbBTC on 
    const USDT_ADDRESS = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9";
    const YOUR_SPENDER_CONTRACT = "0x111111125421cA6dc452d289314280a0f8842A65";
    const chainId = 42161;
    const swapAmount = 153524n;


    const privateKey = config.privateKey;
    const rpc = config.provider;

    const ethersProvider = new ethers.providers.JsonRpcProvider(rpc);
    const user = new ethers.Wallet(privateKey, ethersProvider);



    // First, user needs to approve Permit2 contract for the token (one-time setup)
    // const usdtContract = new ethers.Contract(USDT_ADDRESS, ['function approve(address,uint256)'], user);
    // console.log('Approving USDT for Permit2...');
    
    // await usdtContract.approve(PERMIT2_ADDRESS, ethers.constants.MaxUint256);
    // console.log('✓ USDT approved for Permit2');

    // Generate a random nonce for SignatureTransfer (can be any unused number)
    // const nonce = ethers.BigNumber.from(ethers.utils.randomBytes(32));

    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);


    // const allowanceProv = new AllowanceProvider(ethersProvider, PERMIT2_ADDRESS);
    const { nonce, expiration, amount } = await permit2.allowance(user.address, USDT_ADDRESS, YOUR_SPENDER_CONTRACT);

    console.log('Nonce:', nonce.toString());
    console.log('Expiration:', expiration.toString());
    console.log('Amount:', amount.toString());

    // return;

    // const none2 = si

    // const nonce = ethers.BigNumber.from(ethers.utils.randomBytes(32));

    const permit = {
        permitted: {
            token: USDT_ADDRESS,
            amount: swapAmount
        },
        spender: YOUR_SPENDER_CONTRACT, // This was missing!
        nonce: nonce,
        deadline:expiration// 1 hour expiry
    };

    const permitSingle = {
        details: {
          token: USDT_ADDRESS,
          amount: swapAmount,
          expiration: expiration, // This is the expiration time in general in case 100% of the allowance is not spent
          nonce: nonce, // Use the BigInt nonce directly from the allowance call result
        },
        spender: YOUR_SPENDER_CONTRACT,
        sigDeadline: expiration, // this is the validity time for the signature only.
      };

    console.log('=== Complete Permit Object ===');
    console.log('Token:', permit.permitted.token);
    console.log('Amount:', permit.permitted.amount.toString());
    console.log('Spender:', permit.spender);
    console.log('Nonce:', permit.nonce.toString());
    console.log('Deadline:', permit.deadline);

    try {
        // Get typed data for signing

   
        const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingle, PERMIT2_ADDRESS, 42161);
        
        console.log('=== Permit Data ===');
        console.log('Domain:', domain);
        console.log('Types:', types);
        console.log('Values:', values); // Should now be defined

        // const convertedDomain = convertToBigInt(domain);
        // const convertedValues = convertToBigInt(values);

        // return;

        // Sign the permit
        const signature = await user._signTypedData(domain, types, values);

        const { r, _vs } = ethers.utils.splitSignature(signature);
        const compact = ethers.utils.hexConcat([r, _vs]);
        console.log('Compact:', compact);


        const fusionOrderParams = {
            amount: swapAmount, // 1 USDC as a BigInt
            fromTokenAddress: USDT_ADDRESS,
            toTokenAddress: cbBTC,
            walletAddress: user.address,
            permit: ethers.utils.defaultAbiCoder.encode(
              [
                // owner
                "address",
                // PermitSingle struct: tuple(PermitDetails details, address spender, uint256 sigDeadline)
                // PermitDetails struct: tuple(address token, uint160 amount, uint48 expiration, uint48 nonce)
                "tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)",
                // signature
                "bytes",
              ],
              [
                user.address, // owner
                [
                  [
                    permitSingle.details.token, // token
                    permitSingle.details.amount, // amount
                    permitSingle.details.expiration, // expiration
                    permitSingle.details.nonce, // nonce
                  ],
                  permitSingle.spender, // spender
                  permitSingle.sigDeadline, // sigDeadline
                ],
                compact, // permit2 signature
              ]
            ),
            isPermit2: true,
            enableEstimate: true,
          };

        console.log('=== Success ===');
        console.log('Permit:', permit);
        console.log('Signature:', signature);

        const sdk = new fusionSDK.FusionSDK({
            // blockchainProvider: ethersProvider,
            url: "https://api.1inch.dev/fusion", // base URL
            network: chainId, // Ethereum mainnet
            // IMPORTANT: Ensure DEV_PORTAL_KEY is set as an environment variable
            // DO NOT hardcode your API key here.
            authKey: config.authKey, // auth key
          });
          await new Promise((r) => setTimeout(r, 800));
          const { order, hash, quoteId } = await sdk.createOrder(fusionOrderParams);
      
          // log the order as a single line because we don't need it formatted
        //   console.log(`Order: ${JSON.stringify(transformBigInts(order))}`);
          console.log(`OrderHash: ${hash}`);
          console.log(`QuoteId: ${quoteId}`);
          const orderStruct = order.build();
          const typedData = order.getTypedData(chainId);
      
          // Sign using the correct domain, types, and message (value)
          const orderSignature = await user._signTypedData(
            typedData.domain,
            { Order: typedData.types["Order"] },
            typedData.message // Use the original message; ethers handles BigInts here
          );
      
          const body = {
            order: orderStruct,
            signature: orderSignature,
            quoteId: quoteId,
            extension: order.extension.encode(),
          };

          console.log("body",JSON.stringify(body));
      
        //   console.log(`OrderInfo for API: ${JSON.stringify(transformBigInts(body))}`);
      
          // this is where broadcasting is handled in case you would like to do it automatically
          await new Promise((r) => setTimeout(r, 800));
          await axios.post(
            `https://api.1inch.dev/fusion/relayer/v2.0/${chainId}/order/submit`,
            body,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.authKey}`,
              },
            }
          );

    } catch (error) {
        console.error('=== Error ===');
        console.error('Message:', error.message);
        console.error('Code:', error.code);
        console.error('Argument:', error.argument);
        console.error('Value:', error.value);
    }
}

main().catch(console.error);