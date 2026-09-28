# Vercel Hobby cron fix

V13 remplace le cron horaire par un cron quotidien à 07:00 UTC :

`0 7 * * *`

Ceci respecte la limitation du plan Vercel Hobby à un déclenchement quotidien. Pour Cashlance, les relances sont planifiées en jours (J-3, J+1, J+7, J+15, J+30), donc une exécution quotidienne est suffisante pour le MVP.
