// Explicit title restrictions requested by the owner after copyright notices.
// Match stable source IDs as well as current local URLs so re-import cannot expose them.
export const restrictedAnimeIds=['aa5b4b9d-45e2-4b04-9388-a210eb80a21d','a6c50fca-e35d-4b0c-b4a7-3c9b2f1b1a4c'];
export const restrictedShikimoriIds=[63409,54344];
export const restrictedAnime=a=>restrictedAnimeIds.includes(a?.id)||restrictedShikimoriIds.includes(Number(a?.shikimori_id));
export const restrictedAnimeVisibility=[...restrictedAnimeIds.map(id=>"id<>'"+id+"'"),...restrictedShikimoriIds.map(id=>'COALESCE(shikimori_id,0)<>'+id)].join(' AND ');
