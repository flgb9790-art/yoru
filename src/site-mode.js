// Explicit switch keeps the private deployment reversible without deleting accounts/data.
export const privateSite=()=>process.env.PRIVATE_SITE==='true';
