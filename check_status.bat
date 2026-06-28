@echo off
echo Checking AuraLoop content + audio status...
cd /d "%~dp0"
docker compose exec -T backend node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT day_number, CASE WHEN truth_statement IS NOT NULL AND length(truth_statement)>5 THEN 1 ELSE 0 END as has_content, CASE WHEN morning_audio_path IS NOT NULL THEN 1 ELSE 0 END as has_audio, SUBSTRING(truth_statement,1,50) as truth FROM affirmation_days WHERE journey_id=$1 ORDER BY day_number',[\"d361d516-df76-457d-92bc-428d41f8bc57\"]).then(r=>{console.log('=== AURALOOP STATUS ===');r.rows.forEach(row=>console.log('Day '+row.day_number+': content='+row.has_content+' audio='+row.has_audio+' | '+row.truth));p.end()}).catch(e=>console.log('ERROR:'+e.message));" > "%~dp0status.txt" 2>&1
type "%~dp0status.txt"
pause
