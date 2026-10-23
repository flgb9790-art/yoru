// Words are matched independently: punctuation and word order do not affect a title search.
// Column names are internal constants; all user input goes through SQL parameters.
export function animeSearch(query, values = [], columns = ['name', 'original_name']) {
 const words = [...new Set(String(query).slice(0, 200).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
 if (!words.length) return 'FALSE';
 const parameters = words.map(word => { values.push('%' + word + '%'); return '$' + values.length; });
 return '(' + columns.map(column => '(' + parameters.map(parameter => column + ' ILIKE ' + parameter).join(' AND ') + ')').join(' OR ') + ')';
}
