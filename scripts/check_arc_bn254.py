#!/usr/bin/env python3
"""Check Arc BN254 precompiles with read-only JSON-RPC eth_call requests."""

import argparse
import concurrent.futures
import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.request


NETWORKS = {
    "mainnet": {
        "chain_id": 5042,
        "endpoints": [
            "https://rpc.mainnet.arc.io",
            "https://rpc.drpc.mainnet.arc.io",
        ],
    },
    "testnet": {
        "chain_id": 5042002,
        "endpoints": ["https://rpc.testnet.arc.io"],
    },
}

# Generator and field modulus from EIP-196 and EIP-197.
FIELD_MODULUS = (
    21888242871839275222246405745257275088696311157297823662689037894645226208583
)
G2_GENERATOR = [
    11559732032986387107991004021392285783925812861821192530917403151452391805634,
    10857046999023057135944570762232829481370756359578518086990519993285655852781,
    4082367875863433681332203403145435568316851327593401208105741076214120093531,
    8495653923123431417604973247489272438418190587263600148770280649306958101930,
]


def encode_words(values):
    return "0x" + "".join(format(value, "064x") for value in values)


def precompile_address(number):
    return "0x" + format(number, "040x")


def vectors():
    generator = [1, 2]
    return [
        {
            "name": "add_generator_and_infinity",
            "to": precompile_address(6),
            "data": encode_words(generator + [0, 0]),
            "expected_result": encode_words(generator),
        },
        {
            "name": "mul_generator_by_one",
            "to": precompile_address(7),
            "data": encode_words(generator + [1]),
            "expected_result": encode_words(generator),
        },
        {
            "name": "pairing_single_generator",
            "to": precompile_address(8),
            "data": encode_words(generator + G2_GENERATOR),
            "expected_result": encode_words([0]),
        },
        {
            "name": "pairing_cancelled_pair",
            "to": precompile_address(8),
            "data": encode_words(
                generator
                + G2_GENERATOR
                + [1, FIELD_MODULUS - 2]
                + G2_GENERATOR
            ),
            "expected_result": encode_words([1]),
        },
    ]


def rpc(endpoint, method, params, timeout):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (VeilPay read-only compatibility check)",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.load(response)
    if "error" in body:
        raise RuntimeError("JSON-RPC error: " + json.dumps(body["error"]))
    if "result" not in body:
        raise RuntimeError("JSON-RPC response has no result")
    return body


def check_endpoint(endpoint, expected_chain_id, timeout):
    result = {"endpoint": endpoint, "passed": False, "tests": []}
    try:
        chain_id = int(rpc(endpoint, "eth_chainId", [], timeout)["result"], 16)
        result["chain_id"] = chain_id
        if chain_id != expected_chain_id:
            raise RuntimeError(
                "Unexpected chain ID: {} instead of {}".format(
                    chain_id, expected_chain_id
                )
            )
        block_tag = rpc(endpoint, "eth_blockNumber", [], timeout)["result"]
        result["block"] = int(block_tag, 16)
        for vector in vectors():
            response = rpc(
                endpoint,
                "eth_call",
                [
                    {
                        "to": vector["to"],
                        "data": vector["data"],
                        "gas": "0xf4240",
                    },
                    block_tag,
                ],
                timeout,
            )
            result["tests"].append(
                {
                    **vector,
                    "response": response,
                    "passed": response["result"].lower()
                    == vector["expected_result"],
                }
            )
        result["passed"] = all(test["passed"] for test in result["tests"])
    except urllib.error.HTTPError as error:
        result["error"] = "HTTP {}".format(error.code)
    except Exception as error:
        result["error"] = str(error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", choices=NETWORKS, default="mainnet")
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    network = NETWORKS[args.network]
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=len(network["endpoints"])
    ) as executor:
        futures = [
            executor.submit(
                check_endpoint, endpoint, network["chain_id"], args.timeout
            )
            for endpoint in network["endpoints"]
        ]
        results = [future.result() for future in futures]

    report = {
        "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "network": args.network,
        "method": "read-only eth_call; no transaction sent; no wallet used",
        "references": [
            "https://eips.ethereum.org/EIPS/eip-196",
            "https://eips.ethereum.org/EIPS/eip-197",
        ],
        "results": results,
        "passed": all(result["passed"] for result in results),
        "scope": "Basic precompiles only; not a full Groth16 verifier test",
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
