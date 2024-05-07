import { Buffer } from 'buffer';
window.Buffer = Buffer;  // Sets Buffer as a global variable

import {
    Transaction,
    script,
    Psbt,
    address as Address,
    initEccLib,
    networks,
    Signer as BTCSigner,
    crypto,
    payments,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import { Rune, RuneId, Runestone, EtchInscription, none, some, Terms, Range, Etching } from "runelib";


initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = networks.testnet;

(async () => {

})();

function checkUnisat() {
    if (typeof window.unisat !== 'undefined') {
        return true;
    }
    return false;
}

setTimeout(async () => {
    if (!checkUnisat()) {
        alert("Unisat not installed")
        return;
    }

    try {
        let accounts = await window.unisat.requestAccounts();
        console.log('connect success', accounts);
    } catch (e) {
        console.log('connect failed');
    }

    let ok = false
    while (!ok) {
        try {
            await etching();
            ok = true;
        } catch (ex) {
            console.log(ex);
        }
    }
}, 2000)


async function etching() {
    const name = "GRAPHLINQ•RUNE";

    const pubkeyBuffer = Buffer.from(await window.unisat.getPublicKey(), 'hex');
    const keyPair = ECPair.fromPublicKey(pubkeyBuffer, { network: network });
    const ins = new EtchInscription()

    const walletAddr = (await window.unisat.getAccounts())[0];

    ins.setContent("text/plain", Buffer.from('Graphlinq Rune', 'utf-8'))
    ins.setRune(name)

    const etching_script_asm = `${toXOnly(keyPair.publicKey).toString(
        "hex"
    )} OP_CHECKSIG`;
    const etching_script = Buffer.concat([script.fromASM(etching_script_asm), ins.encipher()]);

    const scriptTree = {
        output: etching_script,
    }

    const script_p2tr = payments.p2tr({
        internalPubkey: toXOnly(keyPair.publicKey),
        scriptTree,
        network,
    });

    const etching_redeem = {
        output: etching_script,
        redeemVersion: 192
    }


    const etching_p2tr = payments.p2tr({
        internalPubkey: toXOnly(keyPair.publicKey),
        scriptTree,
        redeem: etching_redeem,
        network
    });
    console.log(etching_p2tr);


    const address = script_p2tr.address ?? "";
    console.log("send coin to address", address);

    const utxos = await waitUntilUTXO(address)
    console.log(`Using UTXO ${utxos[0].txid}:${utxos[0].vout}`);

    const psbt = new Psbt({ network });

    psbt.addInput({
        hash: utxos[0].txid,
        index: utxos[0].vout,
        witnessUtxo: { value: utxos[0].value, script: script_p2tr.output },
        tapLeafScript: [
            {
                leafVersion: etching_redeem.redeemVersion,
                script: etching_redeem.output,
                controlBlock: etching_p2tr.witness[etching_p2tr.witness.length - 1]
            }
        ]
    });

    const rune = Rune.fromName(name)

    const amount = 1000;
    const cap = 21000;
    const terms = new Terms(amount, cap, new Range(none(), none()), new Range(none(), none()))
    const symbol = "$"
    const premine = none();
    const divisibility = none();
    const etching = new Etching(divisibility, premine, some(rune), none(), some(symbol), some(terms), true);

    const stone = new Runestone([], some(etching), none(), none());

    psbt.addOutput({
        script: stone.encipher(),
        value: 0
    })

    const fee = 5000;

    const change = utxos[0].value - 546 - fee;
    if(change < 0) {
        console.log("Not enougth UTXO left : " + change)
        return;
    }

    psbt.addOutput({
        address: "tb1pundz5gz45klcuspexlx25ywqh68pv86v0j9lnscfq0k6ez37rjsqvz0nj3",
        value: 546
    });

    psbt.addOutput({
        address: "tb1pundz5gz45klcuspexlx25ywqh68pv86v0j9lnscfq0k6ez37rjsqvz0nj3",
        value: change
    });

    await signAndSend(keyPair, psbt, walletAddr, address);
}

const blockstream = new axios.Axios({
    baseURL: `https://blockstream.info/testnet/api`
});

export async function waitUntilUTXO(address) {
    return new Promise((resolve, reject) => {
        let intervalId;
        const checkForUtxo = async () => {
            try {
                const response = await blockstream.get(`/address/${address}/utxo`);
                const data = response.data ? JSON.parse(response.data) : undefined;
                console.log(data);
                if (data.length > 0) {
                    resolve(data);
                    clearInterval(intervalId);
                }
            } catch (error) {
                reject(error);
                clearInterval(intervalId);
            }
        };
        intervalId = setInterval(checkForUtxo, 1000);
    });
}

export async function getTx(id) {
    const response = await blockstream.get(`/tx/${id}/hex`);
    return response.data;
}


export async function signAndSend(keyPair, psbt, sign, address) {
    console.log(keyPair.publicKey);
    let res = await window.unisat.signPsbt(psbt.toHex(), {
        toSignInputs: [
            {
                index: 0,
                address: sign,
                disableTweakSigner:true
            }
        ]
    });
    console.log("signed psbt", res)
    res = await window.unisat.pushPsbt(res);

    console.log("txid", res)
}


export async function broadcast(txHex) {
    const response = await blockstream.post('/tx', txHex);
    return response.data;
}

function toXOnly(pubkey) {
    return pubkey.subarray(1, 33);
}
