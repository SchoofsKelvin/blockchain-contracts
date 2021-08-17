
import '@nomiclabs/hardhat-waffle';
import 'hardhat-gas-reporter';
import 'hardhat-typechain';
import 'hardhat-watcher';
import { HardhatUserConfig } from 'hardhat/types';
import * as dotenv from 'dotenv';

dotenv.config();
const { INFURA_KEY, TEST_MNEMONIC } = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.4',
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
    gasPrice: 10, // BNB "max average"
    currency: 'USD',
  },
  defaultNetwork: 'localhost',
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
  watcher: {
    compile: {
      tasks: [{ command: 'compile', params: { force: true } }],
    },
    // Doesn't actually work because the typechain module gets cached, which includes the contract bytecode
    // (great for when you're working on tests though)
    /*'test:simple': {
      files: ['test/SimplePaymentSplitter.ts', 'typechain/**'],
      tasks: [{ command: 'test', params: { noCompile: true, testFiles: ['./test/SimplePaymentSplitter.ts'] } }],
    }*/
  }
};

export default config;
