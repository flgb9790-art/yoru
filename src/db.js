import {releaseOwnerRestrictions,backfillFavorites} from './data-upgrades.js';
import {removeDisallowed} from './catalog-cleanup.js';
import {removeUnreleased} from './catalog-policy.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(url=process.env.DATABASE_URL){
 if(!url)throw new Error('DATABASE_URL is required');
 return new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:15000});
}
export async function migrate(db){for(const file of ['001_initial.sql','002_telegram.sql','003_playback.sql','004_aniliberty.sql','005_episode_feed.sql','006_follows.sql','007_manual_progress.sql','008_autoparse.sql','009_parser_visibility.sql','010_design_editor.sql','011_disable_design_editor.sql','012_social.sql','013_messenger.sql','014_message_badges.sql','015_private_appeals.sql','016_chat_images.sql','017_message_deletion.sql','018_android_push.sql','019_manual_parser.sql','020_watch_rooms.sql','021_profile_showcase.sql','022_levels.sql','023_achievements.sql','024_aniliberty_availability.sql','025_kodik_rooms.sql','026_kodik_geo.sql','027_player_catalogue.sql','028_registration_invites.sql','029_portal_hero.sql','030_watch_duration.sql','031_library_activity.sql'])await db.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));const legacy=(await db.query('SELECT l.user_id,l.anime_id,MAX(w.updated_at) AS watched_at FROM library l LEFT JOIN watch_history w ON w.user_id=l.user_id AND w.anime_id=l.anime_id AND w.manual_mark=FALSE AND w.position_seconds>0 WHERE l.updated_at IS NULL GROUP BY l.user_id,l.anime_id')).rows;for(const row of legacy)await db.query('UPDATE library SET updated_at=$3 WHERE user_id=$1 AND anime_id=$2',[row.user_id,row.anime_id,row.watched_at||new Date()]);await releaseOwnerRestrictions(db);await removeUnreleased(db);await removeDisallowed(db);await backfillFavorites(db);}
