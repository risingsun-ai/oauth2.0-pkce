import crypto from "node:crypto";
import fs from "node:fs";

// Convert public.pem to JWK Format

// 1. Read your public PEM file
//const pem = fs.readFileSync('public.pem', 'utf8');
// or from env 
const pem = process.env['JWT_PUBLIC_KEY'].replace(/\\n/g, '\n');

// 2. Load it into Node's crypto module
const publicKey = crypto.createPublicKey(pem);

// 3. Export it as a JWK object
const jwk = publicKey.export({ format: 'jwk' });

// 4. Add the standard metadata needed for a JWKS endpoint
jwk.kid = "key-v1";    // Give your key a unique ID (e.g., a UUID or version string)
jwk.use = "sig";       // Declares this key is used for signature verification
jwk.alg = "RS256";     // The algorithm you intend to use

// 5. Output the result
console.log(JSON.stringify(jwk, null, 2));

