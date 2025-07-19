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

// ERC-20 Permit ABI
const ERC20_PERMIT_ABI = [
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function nonces(address owner) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function name() view returns (string)",
    "function version() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

// Check if token supports ERC-2612 Permit
async function supportsPermit(tokenAddress, provider) {
    try {
        const contract = new ethers.Contract(tokenAddress, ERC20_PERMIT_ABI, provider);
        
        // Try to call permit-related functions
        await contract.DOMAIN_SEPARATOR();
        await contract.nonces(ethers.constants.AddressZero);
        
        return true;
    } catch (error) {
        console.log(`Token ${tokenAddress} does not support ERC-2612 Permit:`, error.message);
        return false;
    }
}

// Generate ERC-2612 Permit signature
async function generatePermitSignature(tokenContract, owner, spender, value, deadline, chainId) {
    const name = await tokenContract.name();
    const nonce = await tokenContract.nonces(owner.address);
    
    // Try to get version, fallback to "1" if not available
    let version;
    try {
        version = await tokenContract.version();
    } catch {
        version = "1";
    }

    const domain = {
        name: name,
        version: version,
        chainId: chainId,
        verifyingContract: tokenContract.address
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const values = {
        owner: owner.address,
        spender: spender,
        value: value,
        nonce: nonce,
        deadline: deadline
    };

    const signature = await owner._signTypedData(domain, types, values);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    return { v, r, s, nonce, deadline };
}

// Execute ERC-2612 Permit
async function executePermit(tokenContract, owner, spender, value, deadline, signature) {
    const { v, r, s } = signature;
    
    const tx = await tokenContract.permit(
        owner.address,
        spender,
        value,
        deadline,
        v,
        r,
        s
    );
    
    await tx.wait();
    console.log('✓ ERC-2612 Permit executed successfully');
}

// Generate Permit2 signature and parameters
async function generatePermit2Signature(tokenAddress, spender, amount, user, chainId, permit2Contract) {
    const { nonce, expiration } = await permit2Contract.allowance(user.address, tokenAddress, spender);

    const permitSingle = {
        details: {
            token: tokenAddress,
            amount: amount,
            expiration: expiration,
            nonce: nonce,
        },
        spender: spender,
        sigDeadline: expiration,
    };

    const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingle, PERMIT2_ADDRESS, chainId);
    const signature = await user._signTypedData(domain, types, values);
    const { r, _vs } = ethers.utils.splitSignature(signature);
    const compact = ethers.utils.hexConcat([r, _vs]);

    return { permitSingle, compact };
}

async function main() {
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const cbBTC = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
    const wETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const USDT_ADDRESS = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9";
    const YOUR_SPENDER_CONTRACT = "0x111111125421cA6dc452d289314280a0f8842A65";
    const chainId = 42161;
    const swapAmount = ethers.utils.parseUnits("0.0002", 18).toString();

    const privateKey = config.privateKey;
    const rpc = config.provider;

    const ethersProvider = new ethers.providers.JsonRpcProvider(rpc);
    const user = new ethers.Wallet(privateKey, ethersProvider);

    const tokenAddress = wETH; // Token to check
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_PERMIT_ABI, user);
    
    console.log('Checking permit support for token:', tokenAddress);

    // Check if token supports ERC-2612 Permit
    const hasPermitSupport = await supportsPermit(tokenAddress, ethersProvider);

    if (hasPermitSupport) {
            console.log('✓ Token supports ERC-2612 Permit, using native permit');
            
            try {
                const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
                const signature = await generatePermitSignature(
                    tokenContract,
                    user,
                    YOUR_SPENDER_CONTRACT,
                    swapAmount,
                    deadline,
                    chainId
                );

                // Don't execute permit - just prepare the signature for Fusion
                console.log('✓ ERC-2612 Permit signature generated');

                // Create fusion order with permit data for ERC-2612
                const permitData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "address", "uint256", "uint256", "uint8", "bytes32", "bytes32"],
                    [
                        user.address,
                        YOUR_SPENDER_CONTRACT,
                        swapAmount,
                        signature.deadline,
                        signature.v,
                        signature.r,
                        signature.s
                    ]
                );

                const fusionOrderParams = {
                    amount: swapAmount,
                    fromTokenAddress: tokenAddress,
                    toTokenAddress: USDT_ADDRESS,
                    walletAddress: user.address,
                    permit: permitData,
                    isPermit2: false, // Using ERC-2612, not Permit2
                    enableEstimate: true,
                };

                console.log('✓ Using ERC-2612 Permit for fusion order');
                await processFusionOrder(fusionOrderParams, user, chainId);

        } catch (error) {
            console.error('ERC-2612 Permit failed:', error.message);
            console.log('Falling back to Permit2...');
            await usePermit2(tokenAddress, YOUR_SPENDER_CONTRACT, swapAmount, user, chainId, USDT_ADDRESS);
        }
    } else {
        console.log('Token does not support ERC-2612 Permit, using Permit2');
        await usePermit2(tokenAddress, YOUR_SPENDER_CONTRACT, swapAmount, user, chainId, USDT_ADDRESS);
    }
}

async function usePermit2(tokenAddress, spender, amount, user, chainId, toToken) {
    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, user);

    // Check if user has approved Permit2 for the token
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_PERMIT_ABI, user);
    const permit2Allowance = await tokenContract.allowance(user.address, PERMIT2_ADDRESS);

    if (permit2Allowance.lt(amount)) {
        console.log('Approving token for Permit2...');
        const approveTx = await tokenContract.approve(PERMIT2_ADDRESS, ethers.constants.MaxUint256);
        await approveTx.wait();
        console.log('✓ Token approved for Permit2');
    }

    // Generate Permit2 signature
    const { permitSingle, compact } = await generatePermit2Signature(
        tokenAddress,
        spender,
        amount,
        user,
        chainId,
        permit2
    );

    console.log('=== Permit2 Data ===');
    console.log('Token:', permitSingle.details.token);
    console.log('Amount:', permitSingle.details.amount.toString());
    console.log('Spender:', permitSingle.spender);
    console.log('Nonce:', permitSingle.details.nonce.toString());

    const fusionOrderParams = {
        amount: amount,
        fromTokenAddress: tokenAddress,
        toTokenAddress: toToken,
        walletAddress: user.address,
        permit: ethers.utils.defaultAbiCoder.encode(
            [
                "address",
                "tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)",
                "bytes",
            ],
            [
                user.address,
                [
                    [
                        permitSingle.details.token,
                        permitSingle.details.amount,
                        permitSingle.details.expiration,
                        permitSingle.details.nonce,
                    ],
                    permitSingle.spender,
                    permitSingle.sigDeadline,
                ],
                compact,
            ]
        ),
        isPermit2: true,
        enableEstimate: true,
    };

    console.log('✓ Using Permit2 for fusion order');
    await processFusionOrder(fusionOrderParams, user, chainId);
}

async function processFusionOrder(fusionOrderParams, user, chainId) {
    try {
        const sdk = new fusionSDK.FusionSDK({
            url: "https://api.1inch.dev/fusion",
            network: chainId,
            authKey: config.authKey,
        });

        await new Promise((r) => setTimeout(r, 800));
        const { order, hash, quoteId } = await sdk.createOrder(fusionOrderParams);

        console.log(`OrderHash: ${hash}`);
        console.log(`QuoteId: ${quoteId}`);

        const orderStruct = order.build();
        const typedData = order.getTypedData(chainId);

        const orderSignature = await user._signTypedData(
            typedData.domain,
            { Order: typedData.types["Order"] },
            typedData.message
        );

        const body = {
            order: orderStruct,
            signature: orderSignature,
            quoteId: quoteId,
            extension: order.extension.encode(),
        };

        console.log("Order body:", JSON.stringify(body));

        await new Promise((r) => setTimeout(r, 800));
        const response = await axios.post(
            `https://api.1inch.dev/fusion/relayer/v2.0/${chainId}/order/submit`,
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.authKey}`,
                },
            }
        );

        console.log('✓ Order submitted successfully:', response.data);

    } catch (error) {
        console.error('=== Fusion Order Error ===');
        console.error('Message:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
    }
}

main().catch(console.error);