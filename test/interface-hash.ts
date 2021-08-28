
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { getInterfaceHash, ConvertableToInterface } from "../scripts/utils";
import { IERC165__factory, IERC2981__factory, IERC721Biddable__factory, IERC721Enumerable__factory, IERC721Metadata__factory, IERC721Sellable__factory, IERC721TokenReceiver__factory, IERC721__factory, IPaymentAgent__factory } from "../typechain";

const { expect } = chai.use(solidity);

describe('validate interface hashes', () => {

    function check(name: string, expectedHash: string, inter: ConvertableToInterface, ...extendedInterfaces: ConvertableToInterface[]) {
        it(name, () => expect(getInterfaceHash(inter, ...extendedInterfaces)).to.hexEqual(expectedHash));
    }

    /* IERC165 */
    check('IERC165', '0x01ffc9a7', IERC165__factory);

    /* IERC721 */
    check('IERC721', '0x80ac58cd', IERC721__factory);
    check('IERC721Enumerable', '0x780e9d63', IERC721Enumerable__factory, IERC721__factory);
    check('IERC721Metadata', '0x5b5e139f', IERC721Metadata__factory, IERC721__factory);
    check('IERC721TokenReceiver', '0x150b7a02', IERC721TokenReceiver__factory);

    /* IERC721 custom */
    check('IERC721Sellable', '0x48849482', IERC721Sellable__factory, IERC165__factory, IPaymentAgent__factory);
    check('IERC721Biddable', '0x8c3f8d59', IERC721Biddable__factory, IERC165__factory, IPaymentAgent__factory);

    /* IERC2981 */
    check('IERC2981', '0x2a55205a', IERC2981__factory, IERC165__factory);

    /* IPaymentAgent */
    check('IPaymentAgent', '0x79320088', IPaymentAgent__factory, IERC165__factory);

});
