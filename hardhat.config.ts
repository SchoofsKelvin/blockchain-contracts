
import '@nomiclabs/hardhat-waffle';
import * as dotenv from 'dotenv';
import 'hardhat-gas-reporter';
import 'hardhat-typechain';
import { HardhatUserConfig } from 'hardhat/types';

dotenv.config();
const { INFURA_KEY, TEST_MNEMONIC } = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.13',
    // https://docs.soliditylang.org/en/latest/using-the-compiler.html#input-description
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          deduplicate: true,
          cse: true,
          constantOptimizer: true,
          yul: true,
        },
      },
    },
  },
  gasReporter: {
    showTimeSpent: true,
    gasPrice: 50, // ETH easily achievable minimum
    currency: 'USD',
  },
  defaultNetwork: 'hardhat',
  networks: {
    /*ethereum: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      chainId: 1,
    },*/
    kovan: {
      url: `https://kovan.infura.io/v3/${INFURA_KEY}`,
      accounts: TEST_MNEMONIC ? {
        mnemonic: TEST_MNEMONIC,
        count: 5,
      } : undefined,
      chainId: 42,
      gasPrice: 1e9,
    },
    /*bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
    },*/
    bsctest: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      accounts: TEST_MNEMONIC ? {
        mnemonic: TEST_MNEMONIC,
        count: 5,
      } : undefined,
    },
    hardhat: {
      gasPrice: 90000000000,
      chainId: 1337,
      accounts: TEST_MNEMONIC ? {
        mnemonic: TEST_MNEMONIC,
        count: 5,
      } : undefined,
      hardfork: 'london',
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
        // blockNumber: 12363083,
        enabled: false,
      },
    }
  },
};

export default config;
