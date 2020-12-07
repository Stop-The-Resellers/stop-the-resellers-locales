const { Console } = require("console");
const { DH_NOT_SUITABLE_GENERATOR } = require("constants");
const Discord = require("discord.js");
const moment = require('moment');
const client = new Discord.Client();
var mysql = require('mysql');
const { version } = require("os");
const { resolve } = require("path");
var fs = require('fs');
require("moment-duration-format");

const prefix = ("$")
const dev_ids = ["634979120010362905"];
const logo = "https://cdn.discordapp.com/attachments/702876668422782988/778724658249465856/Untitled-1.png";
const boturl = "https://stoptheresellers.xyz/";
const adminglogchannel = "778909588300759040";
const timer = 43200000; //Fetch Timer, this is every 5 hours
const colors = {"Red": "#FF0000", "Green": "#3CB371", "Yellow": "#FFE333", "Blue": "#4273EA"};
const onCooldown = new Set();

let verified = []
let locale = []

const admins = {
    '634979120010362905': "Breze",
    '165202622112858112': "Tarkayne",
    '179984200919810048': "Beedan",
    '208560916386545665': "Ultrunz",
    '256509232512237568': "JonTron",
    '107947730801836032': "FreeHassan12",
    '308125360963190795': "Hedwig",
    '170192407994826752': "Matus",
    "689865601329791045": "Esplike"
};

const languages ={"en":"English","da":"Danish"};

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "blacklistbot"
});

con.connect(err => {
    if (err) throw err;
    console.log("Conncted to database");
});

//Bot status
client.on('ready', async() => {
    hourlycheck()
    const blacklistedusers = await getBlacklistedUsers()
    console.log(blacklistedusers)
    setInterval(function() {
        let statuses = [prefix + "help", "Servers - " + client.guilds.cache.size, "Blacklisted Users - " + blacklistedusers, boturl];
        let status = statuses[Math.floor(Math.random() * statuses.length)];
        client.user.setPresence({ activity: { name: status }, status: 'online' });
    }, 10000)
    let dirCont = fs.readdirSync("crosschecks/");
    dirCont.forEach(file => {
        fs.unlinkSync(`crosschecks/${file}`)
        console.log(`Successfully deleted ${file} upon bot start`)
    });
    
    client.guilds.cache.forEach(guild => { 
        getGuildLocal(guild)
    })
})

client.on("guildMemberAdd", async (member) => {
    var user = member.id
    var blacklisted = await isBlacklisted(user)
    let autoverify = await checkAutoVerify(member.guild.id)
    var altinfo = await checkAltIdentify(member.guild.id)   
    var alt = altinfo[0]
    var time = Date.now() - member.user.createdAt;
    const days = await dhm(time)

    if (blacklisted) {
        let autoban = await checkAutoBan(member.guild.id)
        if(autoban) {
            var reason = await getBlacklistReason(member);
            member.ban({reason: locale[member.guild.id.toString()]["bans"]["bannedbystr"], reason})
            log(member.guild.id, locale[member.guild.id.toString()]["bans"]["userbanned"], colors["Red"], member, reason)
            adminlog("ban", member, member.guild)
        } else {
            var reason = await getBlacklistReason(user);
            log(member.guild.id, locale[member.guild.id.toString()]["bans"]["joinedblacklisted"], colors["Yellow"], member, reason)
        }
    }
    if(autoverify) {
        let channel = await getLogchannel(member.guild.id);
        if(channel !=undefined) {
            let kick = await checkAutoVerifyKick(member.guild.id)
            verify(member, undefined, channel, member.guild, kick)
            log(member.guild.id, locale[member.guild.id.toString()]["verification"]["verify-started"], colors["Blue"], member, locale[member.guild.id.toString()]["verification"]["joined-server"]) 
        } 
    } 
    if(alt) {
        var mindays = altinfo[1]
        var createdat = member.user.createdAt;
        if(Date.now() - member.user.createdAt < 1000*60*60*24*mindays) {
            log(member.guild.id, locale[member.guild.id.toString()]["alt"]["newaccount"], colors["Yellow"], member, locale[member.guild.id.toString()]["alt"]["newacckick"].formatUnicorn({days:days}))
            // var user = guild.member(member);
            member.send(`You got kicked from **${member.guild.name}** for having an account age lower than **${mindays} day(s)**`).catch(() => console.log("Can't pm this user."));
            member.kick(locale[member.guild.id.toString()]["alt"]["newacclog"].formatUnicorn({created:createdat, mindays:mindays}))
        }
    } else {
        if(Date.now() - member.user.createdAt < 1000*60*60*24*30) {
            // log(member.guild.id, "New account detected!", colors["Yellow"], member,`This account is only ${days} day(s) old.`.formatUnicorn({name:days}))
            log(member.guild.id, locale[member.guild.id.toString()]["alt"]["newaccount"], colors["Yellow"], member, locale[member.guild.id.toString()]["alt"]["newacc"].formatUnicorn({days:days}))
        }
    }
});

client.on("guildCreate", guild => {
    addGuild(guild.id)
})

client.on("guildDelete", guild => {
    removeGuild(guild.id)
})

//Commands
client.on('message', async (msg) => {
    if (msg.content.startsWith(prefix + 'checkuser')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();
        const userid = msg.mentions.users.first() || args.join(" ") 

        if(!msg.mentions.users.first()) {
            if(userid.isNumber()) {
            user = userid
            } else {
                return msg.channel.send(locale[msg.guild.id.toString()]["checking"]["nouser"])
            }
        } else {
            user = userid.id
        }
        if (userid < 1) return msg.channel.send(locale[msg.guild.id.toString()]["no-argsuser"])
        adminlog("check", msg.guild, user, msg.author.id)
        con.query(`SELECT * FROM \`members\` WHERE \`userid\` = '${user}'`, function(error, rows, fields) {
            if (!!error) {
                console.log(error);
            } else {
                if (rows[0]) {
                    if (rows[0].blacklisted === 1) {
                        if(rows[0].reason) {
                            const blacklistedembed = new Discord.MessageEmbed()
                            .setColor(colors["Red"])
                            .setTitle(locale[msg.guild.id.toString()]["blacklist"]["isblacklisted"])
                            .addField(locale[msg.guild.id.toString()]["reason"], rows[0].reason)
                            .addField(locale[msg.guild.id.toString()]["blacklist"]["by"], rows[0].by)
                            .addField(locale[msg.guild.id.toString()]["date"], rows[0].date)
                            .setTimestamp()
                            .setFooter('Stop the resellers', logo);
                        msg.channel.send(blacklistedembed);
                        } else {
                            const blacklistedembed = new Discord.MessageEmbed()
                                .setColor(colors["Red"])
                                .setTitle(locale[msg.guild.id.toString()]["blacklist"]["isblacklisted"])
                                .addField(locale[msg.guild.id.toString()]["reason"], "None Saved")
                                .addField(locale[msg.guild.id.toString()]["blacklist"]["by"], "None Saved")
                                .addField(locale[msg.guild.id.toString()]["date"], "None Saved")
                                .setTimestamp()
                                .setFooter('Stop the resellers', logo);
                            msg.channel.send(blacklistedembed);
                        }
                    } else {
                        const blacklistembed2 = new Discord.MessageEmbed()
                            .setColor(colors["Green"])
                            if(user == '634979120010362905') {
                                blacklistembed2.setTitle('Did you really think Breze was blacklisted?')
                            } else {
                                blacklistembed2.setTitle(locale[msg.guild.id.toString()]["blacklist"]["notblacklisted"])
                            }
                            blacklistembed2.setTimestamp()
                            .setFooter('Stop the resellers', logo);
                        msg.channel.send(blacklistembed2);
                    }
                } else {
                    const blacklistembed2 = new Discord.MessageEmbed()
                        .setColor(colors["Green"])
                        if(user == '634979120010362905') {
                            blacklistembed2.setTitle('Did you really think Breze was blacklisted?')
                        } else {
                            blacklistembed2.setTitle(locale[msg.guild.id.toString()]["blacklist"]["notblacklisted"])
                        }
                        blacklistembed2.setTimestamp()
                        .setFooter('Stop the resellers', logo);
                    msg.channel.send(blacklistembed2);
                }
            }
        });
    } else if(msg.content.startsWith(prefix + 'checkblacklists')) {
        if(admins[msg.author.id]) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            if (args < 1) return msg.channel.send("❌Didn't provide any text to say")
                con.query(`SELECT COUNT(*) FROM members WHERE blacklisted = 1 AND \`by\` = '${args[1]}'`, function(error, rows, fields) {
                    if(!!error) {
                        console.log(error)
                    } else {
                        msg.channel.send(`${args[1]} Has ${rows[0]["COUNT(*)"]} blacklists.`)
                    }
                })
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-admin"])
        }
    } else if (msg.content.startsWith(prefix + 'report')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send(locale[msg.guild.id.toString()]["no-args"])
        var user = args[1]
        let reason = args.slice(2).join(' ');
        var uuid = generateUUID(10)
        var date = Getdate()

        if (reason) {
            if(msg.content.includes("http")) {
                const reportEmbed = new Discord.MessageEmbed()
                .setColor(colors["Red"])
                .setTitle(`Report - ID: ${uuid}`)
                .addField('User ID ', user, true)
                .addField('Username ',`<@${user}>`, true)
                .addField('Reason ', reason, true)
                .addField('Author ', msg.author.id, true)
                .addField('Author Name', `<@${msg.author.id}>`, true)
                .addField('Reported in', `${msg.guild.name} / ${msg.guild.id}`, true)
                .addField('Date', date, true)
                .addField('\u200b', '\u200b')
                .addField('✅Accept?', `$accept ${uuid}`, true)
                .addField('❌Deny?', `$deny ${uuid}`, true)
                .setTimestamp()
                .setFooter('Stop the resellers', logo);
            client.channels.cache.get('702567223625252964').send(reportEmbed);
            
            msg.channel.send(locale[msg.guild.id.toString()]["report"]["thanks"].formatUnicorn({uuid:uuid}))
            msg.delete()
            addReport(uuid, user, reason, msg.author.id, msg.guild.id, date)
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["report"]["no-proof"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["report"]["no-reason"])
        }
    } else if(msg.content.startsWith(prefix + 'accept')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send("Didn't provide any report to accept")
        if (admins[msg.author.id]) {
            var id = args[1]
            var report = await getReport(id)
            if(report != undefined) {
                var userid = report[0];
                var reason = report[1];
                var author = report[2]
                var date = report[3];
                msg.channel.send(`✅Successfully **accepted** report **${id}** and blacklisted **${userid}** / <@${userid}>`)
                blacklist(userid, reason, admins[msg.author.id], date)
                adminlog("blacklist", userid, reason, admins[msg.author.id], date);
                adminlog("accepted", userid, reason, admins[msg.author.id], date, id);
                deleteReport(id, 1)
                client.users.fetch(author, false).then((user) => {
                    user.send(`✅Your report ID **${id}** was **approved** and the user is now blacklisted!`).catch(() => console.log("Can't send DM to your user!"));
                   });

            } else {
                msg.channel.send(`❌There's no report with the ID ${id}`)
            }
        } else {
            msg.channel.send("❌You are not a admin.")
        }
    } else if(msg.content.startsWith(prefix + 'deny')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send("❌Didn't provide any report to deny")
        if (admins[msg.author.id]) {
            if(args[2]) {
                var id = args[1]
                let reason2 = args.slice(2).join(' ');
                var report = await getReport(id)
                if(report != undefined) {
                    var userid = report[0];
                    var reason = report[1];
                    var author = report[2]
                    var date = report[3];
                    msg.channel.send(`✅Successfully **denied** report **${id}** with the reason ${reason2}`)
                    adminlog("denied", userid, reason, admins[msg.author.id], date, id);
                    deleteReport(id, 0)
                    client.users.fetch(author, false).then((user) => {
                        user.send(`❌Your report ID **${id}** was __**denied**__ with the following reason: **${reason2}**`).catch(() => console.log("Can't send DM to your user!"));;
                        });
                } else {
                    msg.channel.send(`❌There's no report with the ID ${id}`)
                }
            } else {
                msg.channel.send(`❌Please provide a reason.`)
            }
        } else { 
            msg.channel.send("❌You are not a admin.")
        }
    } else if(msg.content === prefix + 'viewreports') {
        if(admins[msg.author.id]) {
            con.query(`SELECT * FROM reports`, function(error, rows, fields) {
                if(!!error) {
                    console.log(error)
                } else {
                    const reportEmbed = new Discord.MessageEmbed()
                    .setColor(colors["Blue"])
                    .setTitle(`Pending Reports`)
                    .setTimestamp()
                    .setFooter('Stop the resellers', logo);
                        rows.forEach(row => {
                            reportEmbed.addField('ID', row["id"], true)
                            reportEmbed.addField('User ', `${row["userid"]} / <@${row["userid"]}>`, true)
                            reportEmbed.addField('Reason ', row["reason"], true)
                            reportEmbed.addField('\u200b', '\u200b')
                        })
                    msg.channel.send(reportEmbed)
                }
            })
        } else {
            msg.channel.send("❌You are not a admin.")
        }
    } else if(msg.content.startsWith(prefix + 'viewreport')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send("Didn't provide any report to view")
            if (admins[msg.author.id]) {
                var id = args[1]
                var report = await getReport(id)
                if(report != undefined) {
                    var userid = report[0];
                    var reason = report[1];
                    var author = report[2]
                    var date = report[3];
                    var accepted = report[4];
                    if(accepted === 1) {   
                        reportEmbed = new Discord.MessageEmbed()
                            .setColor(colors["Blue"])
                            .setTitle(`Report - ID: ${id}`)
                            .addField('User ID ', userid, true)
                            .addField('User Name ',`<@${userid}>`, true)
                            .addField('Reason ', reason, true)
                            .addField('Reported by ', author, true)
                            .addField('Reported by Name', `<@${author}>`, true)
                            .addField('Report Status', `Accepted`, true)
                            .addField('Date', date, true)
                            .addField('\u200b', '\u200b')
                            .setTimestamp()
                            .setFooter('Stop the resellers', logo);                        
                    } else if(accepted === 0) {
                        reportEmbed = new Discord.MessageEmbed()
                            .setColor(colors["Blue"])
                            .setTitle(`Report - ID: ${id}`)
                            .addField('User ID ', userid, true)
                            .addField('User Name ',`<@${userid}>`, true)
                            .addField('Reason ', reason, true)
                            .addField('Reported by ', author, true)
                            .addField('Reported by Name', `<@${author}>`, true)
                            .addField('Report Status', `Denied`, true)
                            .addField('Date', date, true)
                            .addField('\u200b', '\u200b')
                            .setTimestamp()
                            .setFooter('Stop the resellers', logo);
                    } else {
                        reportEmbed = new Discord.MessageEmbed()
                        .setColor(colors["Blue"])
                        .setTitle(`Report - ID: ${id}`)
                        .addField('User ID ', userid, true)
                        .addField('User Name ',`<@${userid}>`, true)
                        .addField('Reason ', reason, true)
                        .addField('Reported by ', author, true)
                        .addField('Reported by Name', `<@${author}>`, true)
                        .addField('Report Status', `Not Reviewed`, true)
                        .addField('Date', date, true)
                        .addField('\u200b', '\u200b')
                        .setTimestamp()
                        .setFooter('Stop the resellers', logo);
                    }
                    msg.channel.send(reportEmbed)
                } else {
                    msg.channel.send(`❌There's no report with the ID ${id}`)
                }
            } else {
                msg.channel.send("❌You are not a admin.")
            }
    } else if (msg.content.startsWith(prefix + 'blacklist')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        const reason = msg.content.split(" ").slice(2).join(" ")
        if (args < 2) return msg.channel.send("❌Didn't provide anyone to blacklist / reason")
        if (admins[msg.author.id]) {
            if (args[2]) {
                var date = Getdate()
                if(msg.content.includes("http")) {
                    const addBlacklistembed = new Discord.MessageEmbed()
                        .setColor(colors["Red"])
                        .setTitle('Successfully Blacklisted User')
                        .setDescription(boturl)
                        .addField('User ID ', `${args[1]}`, true)
                        .addField('Name ', `<@${args[1]}>`, true)
                        .addField('Reason ', `${reason}`, true)
                        .addField('Date ', `${date}`, true)
                        .addField('Blacklisted by ', `${msg.author}`, true)
                        .setTimestamp()
                        .setFooter('Stop the resellers', logo);
                    msg.channel.send(addBlacklistembed);
                    blacklist(args[1], reason, admins[msg.author.id], date)
                    adminlog("blacklist", args[1], reason, admins[msg.author.id], date);
                } else if((msg.attachments.size > 0)) {
                    var attatchment = (msg.attachments).array();
                    const addBlacklistembed = new Discord.MessageEmbed()
                        .setColor(colors["Red"])
                        .setTitle('Successfully Blacklisted User')
                        .setDescription(boturl)
                        .addField('User ID ', `${args[1]}`, true)
                        .addField('Name ', `<@${args[1]}>`, true)
                        .addField('Reason ', `${reason} ${attatchment[0].url}`, true)
                        .addField('Date ', `${date}`, true)
                        .addField('Blacklisted by ', `${msg.author}`, true)
                        .setTimestamp()
                        .setFooter('Stop the resellers', logo);
                    msg.channel.send(addBlacklistembed);
                    blacklist(args[1], reason + attatchment[0].url, admins[msg.author.id], date)
                    adminlog("blacklist", args[1], reason + attatchment[0].url, admins[msg.author.id], date);
                } else {
                    msg.channel.send("❌Please submit any kind of proof in the blacklist")
                }
            } else {
                msg.channel.send("❌Provide a user to blacklist and a reason")
            }
        } else {
            msg.channel.send("❌You are not a admin")
        }
    } else if (msg.content.startsWith(prefix + 'unblacklist')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send("Didn't provide any text to say")
        if (admins[msg.author.id]) {
            const date = Getdate()
            const unblacklistembed = new Discord.MessageEmbed()
                .setColor(colors["Green"])
                .setTitle('Successfully Unblacklisted User')
                .setDescription(boturl)
                .addField('User ID ', `${args[1]}`, true)
                .addField('Name ', `<@${args[1]}>`, true)
                .addField('Date ', `${date}`, true)
                .addField('Unblacklisted by ', admins[msg.author.id], true)
                .setTimestamp()
                .setFooter('Stop the resellers', logo);
            msg.channel.send(unblacklistembed);
            adminlog("unblacklist", args[1], "nil", admins[msg.author.id], date);
            unblacklist(args[1])

            client.guilds.cache.forEach(async (guild) => { 
                if (guild.me.hasPermission("BAN_MEMBERS")) { 
                    guild.fetchBans().then(bans => {
                        let banned = bans.find(b => b.user.id == args[1])
                        if(banned) {
                            guild.members.unban(args[1])
                        }
                    });
                }
            })
        } else {
            msg.channel.send("❌You are not a admin")
        }
    } else if (msg.content.startsWith(prefix + 'invite')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (args < 1) return msg.channel.send("Didn't provide any text to say")
        const inviteEmbed = new Discord.MessageEmbed()
            .setColor(colors["Green"])
            .setTitle('INVITE THE BOT HERE')
            .setDescription(boturl)
            .setTimestamp()
            .setFooter('Stop the resellers', logo);
        msg.channel.send(inviteEmbed);
    } else if (msg.content.startsWith(prefix + "fetchservers")) {
        if (admins[msg.author.id] === "Breze") {
            client.guilds.cache.forEach(guild =>  {
                console.log(`${guild.name} - ${guild.id}`) 
            });
        } else {
            message.reply("❌This command can only be used by a developer.");
        }
    } else if (msg.content === prefix + "fetch") {
        if (admins[msg.author.id]) {
            adminlog("fetch", msg.guild, "nil", admins[msg.author.id])
            client.guilds.cache.forEach(guild => {
                guild.members.fetch().then(members => { 
                    guild.members.cache.forEach(async (member) => {
                        var blacklisted = await isBlacklisted(member.id)
                        if (blacklisted) {
                            let enabled = await checkAutoBan(guild.id)
                            if(enabled) {
                                if (member.guild.me.hasPermission("BAN_MEMBERS")) {
                                    if (member.hasPermission("BAN_MEMBERS")) {
                                        const blacklistembed3 = new Discord.MessageEmbed()
                                            .setColor(colors["Yellow"])
                                            .setTitle(locale[msg.guild.id.toString()]["fetch"]["failed"])
                                            .setTimestamp()
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["could-not-ban"], `${member.id} / ${member}`)
                                            .addField(locale[msg.guild.id.toString()]["reason"], locale[msg.guild.id.toString()]["fetch"]["is-admin"])
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["server"], guild)
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["serverowner"], guild.owner)
                                            .setFooter('Stop the resellers', logo)
                                        msg.channel.send(blacklistembed3);
                                        log(guild.id, locale[msg.guild.id.toString()]["fetch"]["failed"], colors["Yellow"], member, locale[msg.guild.id.toString()]["fetch"]["is-admin"])
                                    }
                                    if (member.bannable) {
                                        var reason = await getBlacklistReason(member);

                                        member.ban({reason: locales[msg.guild.id.toString()]["bans"]["bannedbystr"], reason})
                                        console.log(`Banned ${member.id}`)
                                        const blacklistembed2 = new Discord.MessageEmbed()
                                            .setColor(colors["Red"])
                                            .setTitle(locale[msg.guild.id.toString()]["fetch"]["banned"])
                                            .setTimestamp()
                                            .addField(locale[msg.guild.id.toString()]["user-id"], `${member.id}`)
                                            .addField(locale[msg.guild.id.toString()]["username"], `${member}`)
                                            .addField(locale[msg.guild.id.toString()]["banned-in"], guild)
                                            .setFooter('Stop the resellers', logo)
                                        msg.channel.send(blacklistembed2);
                                        log(guild.id, locale[msg.guild.id.toString()]["fetch"]["banned"], colors["Red"], member, reason)
                                        adminlog("ban", member, guild)
                                    } else {
                                        const blacklistembed3 = new Discord.MessageEmbed()
                                            .setColor(colors["Yellow"])
                                            .setTitle(locale[msg.guild.id.toString()]["fetch"]["failed"])
                                            .setTimestamp()
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["could-not-ban"], `${member.id} / ${member}`)
                                            .addField(locale[msg.guild.id.toString()]["reason"], locale[msg.guild.id.toString()]["fetch"]["role-above"])
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["server"], guild)
                                            .addField(locale[msg.guild.id.toString()]["fetch"]["serverowner"], guild.owner)
                                            .setFooter('Stop the resellers', logo)
                                        msg.channel.send(blacklistembed3);
                                        log(guild.id, locale[msg.guild.id.toString()]["fetch"]["failed"], colors["Yellow"], member, locale[msg.guild.id.toString()]["fetch"]["role-above"])
                                    }
                                } else {
                                    const blacklistembed4 = new Discord.MessageEmbed()
                                        .setColor(colors["Red"])
                                        .setTitle(locale[msg.guild.id.toString()]["fetch"]["no-permission"])
                                        .addField(locale[msg.guild.id.toString()]["fetch"]["could-not-ban"], `${member.id} / ${member}`)
                                        .addField(locale[msg.guild.id.toString()]["fetch"]["server"], guild)
                                        .addField(locale[msg.guild.id.toString()]["fetch"]["serverowner"], guild.owner)
                                        .setTimestamp()
                                        .setFooter('Stop the resellers', logo)
                                    msg.channel.send(blacklistembed4);
                                    log(guild.id, locale[msg.guild.id.toString()]["fetch"]["no-permission"], colors["Red"], member)
                                }
                            } 
                        }
                    })
                })
            });
        } else {
            msg.channel.send(locale[msg.guild.id.toString()["no-admin"]])
        }
    } else if (msg.content === prefix + 'help') {
        const helpembed = new Discord.MessageEmbed()
            .setColor(colors["Green"])
            .setTitle('COMMAND LIST')
            .setTimestamp()
            .setDescription(boturl)
            .addField(prefix + "blacklist [Discord ID] [Reason)", locale[msg.guild.id.toString()]["help"]["blacklist"])
            .addField(prefix + "unblacklist [Discord ID]", locale[msg.guild.id.toString()]["help"]["unblacklist"])
            .addField(prefix + "checkuser [Discord ID]", locale[msg.guild.id.toString()]["help"]["checkuser"])
            .addField(prefix + "fetch", locale[msg.guild.id.toString()]["help"]["fetch"])
            .addField(prefix + "report [Discord ID] [REASON & PROOF]", locale[msg.guild.id.toString()]["help"]["report"])
            .addField(prefix + "viewreport [Report ID]", locale[msg.guild.id.toString()]["help"]["viewreport"])
            .addField(prefix + "viewreports", locale[msg.guild.id.toString()]["help"]["viewreports"])
            .addField(prefix + "setlogchannel [Channel ID]", locale[msg.guild.id.toString()]["help"]["setlogchannel"])
            .addField(prefix + "setautoban [true / false]", locale[msg.guild.id.toString()]["help"]["setautoban"])
            .addField(prefix + "setaltprotection [true/false] [days]", locale[msg.guild.id.toString()]["help"]["setaltprotection"])
            .addField(prefix + "setautoverify [toggle: true / false] [kick: true / false]", locale[msg.guild.id.toString()]["help"]["setautoverify"])
            .addField(prefix + "botinfo", locale[msg.guild.id.toString()]["help"]["botinfo"])
            .addField(prefix + `userinfo || ${prefix}userinfo @[user] `, locale[msg.guild.id.toString()]["help"]["userinfo"])
            .setFooter('Stop the resellers', logo);
        msg.channel.send(helpembed);
    } else if (msg.content === prefix + "botinfo") {
            let inline = true
            let bicon = client.user.avatarURL({ dynamic:true })
            let uptime = moment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");
            let servsize = client.guilds.cache.size
            const blacklistedusers = await getBlacklistedUsers();
            let botembed = new Discord.MessageEmbed()
                .setColor("#00ff00")
                .setThumbnail(bicon)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["bot-name"], `:robot: ${client.user.username}`, inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["bot-owner"], ":crown: <@634979120010362905>", inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["servers"], `🛡 ${servsize}`, inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["users"], `⚙️ ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["uptime"], `⏱ ${uptime}`, inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["ping"], `🏓 ${Date.now() - msg.createdTimestamp}ms`)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["bot-library"], ":computer: Discord.js", inline)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["created-on"], `${moment.utc(client.user.createdAt).format("dddd, MMMM Do YYYY")}`)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["blacklisted-users"], blacklistedusers)
                .addField(locale[msg.guild.id.toString()]["botinfo"]["website"], "https://stoptheresellers.xyz")
                .setFooter(`${locale[msg.guild.id.toString()]["botinfo"]["support-server"]} https://discord.gg/Ua9QVDFsa3`)
                .setAuthor(client.user.username + '#' + client.user.discriminator, bicon)
                .setTimestamp()
            msg.channel.send(botembed);
    } else if (msg.content.startsWith(prefix + "sendpm")) {
        if (msg.author.id === '634979120010362905') {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            const reason = msg.content.split(" ").slice(2).join(" ")
            
            client.users.fetch(args[1], false).then((user) => {
                user.send(reason);
                msg.channel.send(`✅Sucessfully sent message to ${args[1]} / <@${args[1]}>`)
               });
        } else {
            msg.channel.send("❌You can't use this command")
        }
    } else if (msg.content.startsWith(prefix + "setlogchannel")) {
        if (msg.member.hasPermission('ADMINISTRATOR')) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            var server = msg.guild.id;
            let logchannel = await getLogchannel(server);
            let channel = args[1]

            if (channel.isNumber()) {
                if(logchannel != args[1]) {
                    con.query("SELECT * FROM logs WHERE guild = " + server, function(error, rows, fields) {
                        if (rows[0]) {
                            con.query(`UPDATE logs SET \`channel\` = '${channel}' WHERE guild = ` + server, function(error, rows, fields) {
                                if (!!error) {
                                    console.log(error);
                                } else {
                                    msg.channel.send(locale[msg.guild.id.toString()]["logs"]["updated"].formatUnicorn({channel:channel}))
                                }
                            });
                        } else {
                            con.query(`INSERT INTO logs (\`guild\`, \`channel\`) VALUES ('${server}','${channel}')`, function(error, rows, fields) {
                                if (!!error) {
                                    console.log(error);
                                } else {
                                    msg.channel.send(locale[msg.guild.id.toString()]["logs"]["added"].formatUnicorn({channel:channel}))
                                }
                            });
                        }
                    });
                } else {
                    msg.channel.send(locale[msg.guild.id.toString()]["logs"]["same-channel"].formatUnicorn({logchannel:channel}))
                }
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["logs"]["not-correctly"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content.startsWith(prefix + 'setautoban')) {
        if (msg.member.hasPermission('ADMINISTRATOR')) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            if(args[1]) {
                var server = msg.guild.id;
                let bool = args[1]
                let enabled = await checkAutoBan(server)
                if(bool === 'true') {
                    if(enabled) {
                        msg.channel.send(locale[msg.guild.id.toString()]["autoban"]["alreadyenabled"])
                    } else {
                        msg.channel.send(locale[msg.guild.id.toString()]["autoban"]["enabled"])
                        setAutoBan(server, true)
                    }
                } else if(bool === 'false') {
                    if(!enabled) {
                        msg.channel.send(locale[msg.guild.id.toString()]["autoban"]["alreadydisabled"])
                    } else {
                        msg.channel.send(locale[msg.guild.id.toString()]["autoban"]["disabled"])
                        setAutoBan(server, false)
                    }
                } 
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["autoban"]["no-args"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content.startsWith(prefix + "userinfo")) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);

        if(args[1]) {
            if(args[1].isNumber()) {
                user = await client.users.fetch(args[1])
                guser = await msg.guild.members.fetch(args[1]).catch(error => {
                    return msg.channel.send(locale[msg.guild.id.toString()]["userinfo"]["no-user"])
                })
                if(!user) {
                    return msg.channel.send(locale[msg.guild.id.toString()]["userinfo"]["no-user2"])
                }
            } else if (msg.mentions.users.first()){
                user = msg.mentions.users.first();
                guser = msg.guild.member(user)
            }
        } else {
            user = msg.author;
            guser = msg.guild.member(user)
        }

        var blacklisted = await isBlacklisted(user.id)
        const userembed = new Discord.MessageEmbed()
        .setAuthor(user.username + '#' + user.discriminator, user.avatarURL({ dynamic:true }))
        .setDescription(`${user}`)
        .setColor(colors["Blue"])
        .setThumbnail(user.avatarURL({ dynamic:true }))
        .addField(locale[msg.guild.id.toString()]["userinfo"]["joined"], `${moment.utc(guser).format("dddd, MMMM Do YYYY")}`, true)
        .addField(locale[msg.guild.id.toString()]["userinfo"]["created"], `${moment.utc(user.createdAt).format("dddd, MMMM Do YYYY")}`, true) 
        .addField(locale[msg.guild.id.toString()]["userinfo"]["avatar-url"], `[${locale[msg.guild.id.toString()]["userinfo"]["avatar-url"]}](${user.avatarURL({ dynamic:true })})`) 
        .addField(locale[msg.guild.id.toString()]["userinfo"]["blacklisted"], capFirst(blacklisted.toString()), true)   
        .setFooter(`ID: ${user.id}`, logo)
        .setTimestamp();
        if (guser._roles.length < 1)
            userembed.addField(locale[msg.guild.id.toString()]["userinfo"]["roles"], locale[msg.guild.id.toString()]["userinfo"]["none"], true) 
        else {
            userembed.addField(locale[msg.guild.id.toString()]["userinfo"]["roles"], ` <@&${guser._roles.join('> <@&')}>`, true) 
        }
        msg.channel.send(userembed)
    } else if(msg.content.startsWith(prefix + 'forceverify')) {
        if(admins[msg.author.id]) {
            let user = msg.guild.member(msg.mentions.users.first());
            if(user) {                
                let kicken = checkAutoVerifyKick(msg.guild.id)
                verify(user, msg.author, msg.channel.id, msg.guild, kicken)
                adminlog("verifystarted", user.id, msg.guild, msg.author.id)
            } else {
                msg.channel.send("❌You didn't provide a user to verify.")
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-admin"])
        }
    } else if(msg.channel.id === '781170482606374912') {
        if(msg.content.startsWith("-.no")) {
            var args = msg.content.slice(3).trim().split(/ +/g);
            let leakingservers = args.slice(2).join(' ');

            if(verified[args[1]]) {
                if(verified[args[1].toString()].channel) {
                    client.channels.cache.get(verified[args[1].toString()].channel).send(`${locale[msg.guild.id.toString()]["verification"]["inleaking"].formatUnicorn({args:args[1]})} \r\n ${leakingservers}`).catch(console.error);
                    verified[args[1]] = {channel: false}
                    verified[args[1]] = {id: args[1]}
                } 
            } else {
                console.log("Something went really wrong?")
            }
        } else if(msg.content.startsWith("-.yes")) {
            var args = msg.content.slice(4).trim().split(/ +/g);

            if(verified[args[1]]) {
                if(verified[args[1].toString()].channel) {
                    // log(guild.id, "✅User Verified", colors["Green"], `<@${args[1]}`, "Successfully verified and is not in any leaking servers.")
                    client.channels.cache.get(verified[args[1].toString()].channel).send(locale[msg.guild.id.toString()]["verification"]["noleaking"].formatUnicorn({args:args[1]})).catch(console.error);
                    verified[args[1]] = {channel: false}
                    verified[args[1]] = {id: args[1]}
                } else {
                    console.log("Something went really wrong?")
                }
            }
        }
    } else if(msg.content.startsWith(prefix + 'setautoverify')) {
        if (msg.member.hasPermission('ADMINISTRATOR')) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            if(args[1]) {
                if(args[2]) {
                    var server = msg.guild.id;
                    let bool = args[1]
                    let kick = args[2]
                    let enabled = await checkAutoVerify(server)
                    let havelogs = await getLogchannel(msg.guild.id);

                    if(bool === 'true') { 
                        if(enabled) {
                            msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["alreadyenabled"])  
                        } else {
                            if(havelogs) {
                                if(kick === "true") { 
                                    setAutoVerify(server, true, true)
                                    msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["enabled"])
                                } else if(kick=== 'false') {
                                    setAutoVerify(server, true, false)
                                    msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["enabled"])
                                } else {
                                    msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["no-args2"])
                                }
                            } else {
                                msg.channel.send(locale[msg.guild.id.toString()]["logs"]["no-logs"])
                            }
                        }
                    } else if(bool === 'false') {
                        if(!enabled) {
                            msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["alreadydisabled"]);
                        } else {
                            msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["disabled"])
                            setAutoVerify(server, false, false)
                        }
                    } 
                } else {
                    msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["no-args2"])
                }
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["autoverify"]["no-args"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content === prefix + 'deletelogs') {
        if(msg.member.hasPermission("ADMINISTRATOR")) {
            let guild = msg.guild.id;
            let havelogs = await getLogchannel(guild);
            if(havelogs) {
                deleteLogs(guild)
                msg.channel.send(locale[msg.guild.id.toString()]["logs"]["removed"].formatUnicorn({havelogs:havelogs}))
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["need-logs"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content.startsWith(prefix + 'setaltprotection')) {
        if (msg.member.hasPermission('ADMINISTRATOR')) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            var info = await checkAltIdentify(msg.guild.id)   
            var enabled = info[0]
            var days = info[1]
            
            if(enabled == true) {
                if(args[1] == 'true') {
                    msg.channel.send(locale[msg.guild.id.toString()]["alt"]["alreadyenabled"].formatUnicorn({days:days}))
                } else if (args[1] == 'false'){
                    msg.channel.send(locale[msg.guild.id.toString()]["alt"]["disabled"])
                    setAltIdentify(msg.guild.id)
                }
            } else if(enabled == false) { 
                if(args[1]) {
                    if(args[1] == 'true') {
                        if(args[2]) {
                            var logcnl = await getLogchannel(msg.guild.id)
                            if(logcnl) {
                                msg.channel.send(locale[msg.guild.id.toString()]["alt"]["enabled"].formatUnicorn({args:args[2]}))
                                setAltIdentify(msg.guild.id, args[2])
                            } else {
                                msg.channel.send(locale[msg.guild.id.toString()]["need-logs"])
                            }
                        } else {
                            msg.channel.send(locale[msg.guild.id.toString()]["alt"]["minimum-age"])
                        }
                    } else if(args[1] == 'false') {
                        msg.channel.send(locale[msg.guild.id.toString()]["alt"]["alreadydisabled"])
                    }
                } else {
                    msg.channel.send(locale[msg.guild.id.toString()]["alt"]["no-args"])
                }
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content.startsWith(prefix + 'crosscheck')) {
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        if (msg.member.hasPermission('ADMINISTRATOR')) {
            adminlog("crosscheck", msg.author, msg.guild) 
            if(admins[msg.author.id]) {
                msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["success"])
                const file = fs.createWriteStream(`crosschecks/${msg.guild.id}.txt`, { flags: 'a' });
                file.write(`${locale[msg.guild.id.toString()]["crosscheck"]["blacklisted-in"].formatUnicorn({guild:msg.guild.name})} \n \n`);
                msg.guild.members.fetch().then(members => {  
                    msg.guild.members.cache.forEach(async (member) => { 
                    var blacklisted = await isBlacklisted(member.id)
                        if(blacklisted) {
                            var reason = await getBlacklistReason(member.id)
                            file.write(`${member.id} - ${member.user.tag} - ${reason}\n`);
                        }
                    })
                })
                setTimeout(function() {
                    file.write(`\nStop The Resellers made by Breze. \nhttps://stoptheresellers.xyz`);
                    const { MessageAttachment } = require('discord.js')
                    const attachment = new MessageAttachment(`crosschecks/${msg.guild.id}.txt`);
                    const user = msg.author;
                    if(attachment) {
                        user.send(attachment).catch(() => msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["no-dm"]))
                    } else {
                        msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["error"])
                    }
                }, 1000*10)
            } else {
                if(onCooldown.has(msg.author.id)) {
                    msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["cooldown"])
                } else {
                    onCooldown.add(msg.author.id)
                    msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["success"])
                    file.write(`${locale[msg.guild.id.toString()]["crosscheck"]["blacklisted-in"].formatUnicorn({guild:msg.guild.name})} \n \n`);;
                    msg.guild.members.fetch().then(members => {  
                        msg.guild.members.cache.forEach(async (member) => { 
                        var blacklisted = await isBlacklisted(member.id)
                            if(blacklisted) {
                                var reason = await getBlacklistReason(member.id)
                                file.write(`${member.id} - ${member.user.tag} - ${reason}\n`);
                            }
                        })
                    })
                    setTimeout(function() {
                        file.write(`\nStop The Resellers made by Breze. \nhttps://stoptheresellers.xyz`);
                        const { MessageAttachment } = require('discord.js')
                        const attachment = new MessageAttachment(`crosschecks/${msg.guild.id}.txt`);
                        const user = msg.author;
                        if(attachment) {
                            user.send(attachment).catch(() => msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["no-dm"]))
                        } else {
                            msg.channel.send(locale[msg.guild.id.toString()]["crosscheck"]["error"])
                        }
                    }, 1000*10)
                    setTimeout(() => {
                        onCooldown.delete(msg.author.id)
                    }, 1000 * 60 * 60 * 24); ///24 Hours
                }

            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        }
    } else if(msg.content === prefix + "test") {
        if(admins[msg.author.id]) {
            getGuildLocal(msg.guild)
        }
    } else if(msg.content.startsWith(prefix + 'setlanguage')) {
        if(msg.member.hasPermission("ADMINISTRATOR")) {
            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            if(args[1]) {
                var proceed = undefined

                Object.keys(languages).forEach(function(key){
                    if(args[1] == key) {
                        proceed = true
                    } 
                });
            setTimeout(() => {
                if(proceed != undefined) { 
                    msg.channel.send(locale[msg.guild.id]["languages"]["success"].formatUnicorn({args:args[1]}));
                    setLang(msg.guild.id, args[1])
                } else (
                    msg.channel.send(locale[msg.guild.id]["languages"]["error"])
                )
            }, 100);
            } else {
                msg.channel.send(locale[msg.guild.id.toString()]["no-args"])
            }
        } else {
            msg.channel.send(locale[msg.guild.id.toString()]["no-permission"])
        } 
    } else if(msg.content === (prefix + 'languages')) {
        const langembed = new Discord.MessageEmbed()
            .setColor(colors["Blue"])
            .setTitle(locale[msg.guild.id]["languages"]["all"])
            Object.keys(languages).forEach(function(key){
                langembed.addField(languages[key], key)
            });
            langembed.addField('\u200b', '\u200b')
            .addField(locale[msg.guild.id]["languages"]["contribute"], "https://github.com/brezedc/stop-the-resellers-locales")
            .setTimestamp()
            .setFooter('Stop the resellers', logo)
        msg.channel.send(langembed);
    }
});

function setLang(guild, lang) {
    con.query(`SELECT * FROM locals WHERE guild = ${guild}`, async function(error, rows, fields) {
        if(rows[0]) {
            con.query(`UPDATE locals SET lang = '${lang}' WHERE guild = ${guild}`)
            locale[guild] = await getLocal(lang)
        } else {
            con.query(`INSERT INTO locals (guild, lang) VALUES ('${guild}', '${lang}')`)
            locale[guild] = await getLocal(lang)
        }
    })
}

function getLogchannel(guild) {
    return new Promise(function(resolve, reject) {
        if(guild) {
            con.query(`SELECT * FROM logs WHERE guild = ${guild}`, function(error, rows, fields) {
                if(!!error) {
                    console.log(error) 
                } else {
                    if(rows[0]) {
                        resolve(rows[0].channel)
                    } else {
                        resolve(undefined)
                    }
                }
            })
        }
    }) 
}

function deleteLogs(guild) {
    con.query(`DELETE FROM logs WHERE guild = ${guild}`, function(error, rows, fields) {
        if(!!error) {
            console.log(error)
        } 
    })
}
function log(guild, title, color, member, reason) {
    console.log(locale[guild.id]["username"])
    con.query("SELECT * FROM `logs` WHERE guild = " + guild, function(error, rows, field) {
        if (!!error) {
            console.log(error)
        } else {
            if(rows[0]) {
                const channel = rows[0].channel;
                if(channel) {
                    if(reason) {
                        const logembed = new Discord.MessageEmbed()
                        .setColor(color)
                        .setTitle(title)
                        .addField(locale[guild.id]["username"], `${member} / ${member.id}`) 
                        .addField(locale[guild.id]["reason"], reason)
                        .setTimestamp()
                        .setFooter('Stop the resellers', logo);
                        client.channels.cache.get(channel).send(logembed);
                    } else {
                        const logembed = new Discord.MessageEmbed()
                        .setColor(color)
                        .setTitle(title)
                        .addField(locale[guild.id]["username"], `${member} / ${member.id}`)
                        .setTimestamp()
                        .setFooter('Stop the resellers', logo);
                        client.channels.cache.get(channel).send(logembed);
                    }
                } 
            } 
        }
    })
}

function adminlog(type, member, reason, author, date, id) { 
    if(type === "blacklist") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Red"])
        .setTitle('Successfully Blacklisted User')
        .addField('User ID ', member, true)
        .addField('Name ', `<@${member}>`, true)
        .addField('Reason ', reason, true)
        .addField('Date ', date, true)
        .addField('Blacklisted by ', author, true)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
    client.channels.cache.get(adminglogchannel).send(adminlogembed);
    } else if(type === "unblacklist") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Green"])
        .setTitle('Successfully Unblacklisted User')
        .addField('User ID ', member, true)
        .addField('Name ', `<@${member}>`, true)
        .addField('Date ', date, true)
        .addField('Unblacklisted by ', author, true)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    } else if(type === "fetch") {
        if(member === "auto") {
            const adminlogembed = new Discord.MessageEmbed()
            .setColor(colors["Blue"])
            .setTitle('Fetch Requested')
            .addField('Called by ',author, true)
            .setTimestamp()
            .setFooter('Stop the resellers', logo);
            client.channels.cache.get(adminglogchannel).send(adminlogembed);
        } else {
            const adminlogembed = new Discord.MessageEmbed()
            .setColor(colors["Blue"])
            .setTitle('Fetch Requested')
            .addField('Called by ',author, true)
            .addField('Called in ', `${member.id} / ${member.name}`, true)
            .setTimestamp()
            .setFooter('Stop the resellers', logo);
            client.channels.cache.get(adminglogchannel).send(adminlogembed);
        }
    } else if(type === "check") { 
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Blue"])
        .setTitle('Check Requested')
        .addField('Called by ', `${author} / <@${author}>`, true)
        .addField('Called in ', `${member.id} / ${member.name}`, true)
        .addField('Id checked ', `${reason} / <@${reason}>`, true)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    } else if(type === "ban") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Red"])
        .setTitle('User Banned')
        .addField('Name ', `${member.id} / ${member}`, true)
        .addField('Banned in ', `${reason.id} / ${reason.name} `, true)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    } else if(type === "accepted") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Green"])
        .setTitle('Report Accepted')
        .addField('Report ID', id)
        .addField('Name ', `${member} / <@${member}>`, true)
        .addField('Accepted by', author)
        .addField('Date', date)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    }  else if(type === "denied") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Yellow"])
        .setTitle('Report Denied')
        .addField('Report ID', id)
        .addField('Name ', `${member} / <@${member}>`, true)
        .addField('Denied by', author)
        .addField('Date', date)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    }  else if(type === "verifystarted") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Blue"])
        .setTitle('Verification Started')
        .addField('Verify', `${member} / <@${member}>`)
        .addField('Started By ', `${author} / <@${author}>`, true)
        .addField('Started in', `${reason.id} / ${reason.name}`)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    } else if(type === "crosscheck") {
        const adminlogembed = new Discord.MessageEmbed()
        .setColor(colors["Blue"])
        .setTitle('Crosscheck Requested')
        .addField('Started By ', `${member} / ${member.id}`, true)
        .addField('Started in', `${reason.id} / ${reason.name}`)
        .setTimestamp()
        .setFooter('Stop the resellers', logo);
        client.channels.cache.get(adminglogchannel).send(adminlogembed);
    }
}

function hourlycheck() {
    setInterval(function() {
        adminlog("fetch", "auto", "nil", "Automatic bot fetch")
            client.guilds.cache.forEach(guild => {
                guild.members.fetch().then(members => { 
                    guild.members.cache.forEach(async (member) => {
                        var blacklisted = await isBlacklisted(member.id)
                        if (blacklisted) {
                            let enabled = await checkAutoBan(guild.id)
                            if(enabled) {
                                if (member.guild.me.hasPermission("ADMINISTRATOR")) {
                                    if (member.hasPermission("BAN_MEMBERS")) {
                                        log(guild.id, locale[guild.id.toString()]["fetch"]["failed"], colors["Yellow"], member, locale[guild.id.toString()]["fetch"]["role-above"])
                                    }
                                    if (member.bannable) {
                                        var reason = await getBlacklistReason(member);
                                        member.ban({reason: locales[guild.id.toString()]["bans"]["bannedbystr"], reason})
                                        log(guild.id, locale[guild.id.toString()]["fetch"]["banned"], colors["Red"], member, reason)
                                        adminlog("ban", member, guild)
                                    } else {
                                        log(guild.id, locale[guild.id.toString()]["fetch"]["failed"], colors["Yellow"], member, locale[guild.id.toString()]["fetch"]["role-above"])
                                    }
                                } else {
                                    log(guild.id, locale[guild.id.toString()]["fetch"]["no-permission"], colors["Red"], member)
                                }
                            }
                        } 
                    })
                })
            });
    },  timer); 
}

function verify(user, author, channel, guild, kicken) { 
    client.users.fetch(user.id, false).then((user) => {
        if(author != undefined) {
            user.send(`${author} from ${guild.name} wants you to verify yourself. Do it with this link http://stoptheresellers.xyz/auth/verify`)
            .then(client.channels.cache.get(channel).send(`✅Sucessfully sent verify message to ${user}`))
            .catch(() => client.channels.cache.get(channel).send("❌Can't send DM to your user!"));
        } else {
            user.send(`Welcome to ${guild.name}. In order to stay in the server you need to verify yourself with this link http://stoptheresellers.xyz/auth/verify.`).catch(() => log(guild.id, "❌Can't send PM.", colors["Yellow"], user));
        }
        verified[user.id.toString()] = {channel: channel}
        setTimeout(async () => { 
            if(!verified[user.id].id) {
                let user2 = await guild.member(user);
                if(kicken === true) {
                    if(guild.me.permissions.has("KICK_MEMBERS")) {
                        user.send(`❌You did not do the verification from ${guild.name} and got kicked..`)
                        user2.kick(locale[guild.id.toString()]["verification"]["kick-msg"].formatUnicorn({author:author})).catch(err => console.log(err)) 
                        log(guild.id, locale[guild.id.toString()]["verification"]["user-kicked"], colors["Yellow"], user, locale[guild.id.toString()]["verification"]["reason"])
                    } else {
                        if(author !=undefined) {
                            client.channels.cache.get(channel).send(locale[guild.id.toString()]["verification"]["no-kick-permission"]);
                        } else {
                            log(guild.id, locale[guild.id.toString()]["verification"]["no-kick-permission"], colors["Yellow"], user)
                        }
                    }
                } else if(kicken === false) {
                    console.log(`Kick disabled? ${kicken}`)
                    if(author !=undefined) {
                        client.channels.cache.get(channel).send(`❌${user} ${locale[guild.id.toString()]["verification"]["reason"]}`);
                    } else {
                        log(guild.id, locale[guild.id.toString()]["verification"]["no-verify"], colors["Yellow"], user)
                    }
                }
            } else {
                console.log(verified[user.id.toString()].id)
            }
        }, 10 * 60 * 1000);
    });
}

function blacklist(id, reason, author, date) {
    con.query("SELECT * FROM members WHERE userid = " + id, function(error, rows, fields) {
        if (rows[1]) {
            con.query(`UPDATE members SET blacklisted = 1, \`reason\` = '${reason}', \`by\` = '${author}', \`date\` = '${date}' WHERE userid = '${id}'`, function(error, rows, fields) {
                console.log(`Updated ${id}`)
                if (!!error) {
                    console.log(error);
                } 
            });
        } else {
            con.query(`INSERT INTO members (\`userid\`, blacklisted, \`reason\`, \`by\`, \`date\`) VALUES ('${id}', 1, "${reason}", '${author}', '${date}')`, function(error, rows, fields) {
                if (!!error) {
                    console.log(error);
                } 
            });
        }
    });
}

function unblacklist(id) {
    con.query(`SELECT * FROM members WHERE \`userid\` = '${id}'`, function(error, rows, fields) {
        if (rows) {
            con.query(`UPDATE members set blacklisted = 0 WHERE userid = ${id}`, function(error, rows, fields) {
                if (!!error) {
                    console.log(error);
                } else {
                    console.log(`Sucessfully unblacklisted ${id} By updating the table`);
                }
            });
        }
    });
}

function isBlacklisted(user) {
    return new Promise(function(resolve, reject){ 
        con.query(`SELECT * FROM members WHERE \`userid\` = '${user}'`, function(error, rows, fields) {
            if(rows[0]) {
                if(rows[0].blacklisted) {
                    resolve(true)
                } else {
                    resolve(false)
                }
            } else {
                resolve(false)
            }
        });
    })
}

function getBlacklistReason(user) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT reason FROM members WHERE \`userid\` = '${user}'`, function(error, rows, fields) {
            if(rows[0]) {
                resolve(rows[0].reason)
            }
        })
    })
}

function getBlacklistedUsers() {
    return new Promise(function(resolve, reject) {
        con.query("SELECT COUNT(*) FROM `members` WHERE blacklisted = 1", function(error, rows, field) { 
            if(!!error) {
                console.log(error)
            } else {
                if(rows[0]) {
                    resolve(rows[0]["COUNT(*)"])
                }
            }
        })
    })
}

function addReport(uuid, userid, reason, author, guild, date) {
    con.query(`INSERT INTO reports (\`id\`, \`userid\`, \`reason\`, \`author\`, \`reportguild\`, \`date\`) VALUES ('${uuid}', '${userid}', '${escapeStr(reason)}', '${author}', '${guild}', '${date}')`, function(error, rows, fields) {
        if (!!error) {
            console.log(error)
        } else {
            console.log("Successfully added report in database");
        }
    })
}

function getReport(id) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM reports WHERE \`id\` = ${id}`, function(error, rows, fields) {
            if(rows[0]) {
                resolve([rows[0].userid, rows[0].reason, rows[0].author, rows[0].date]);
            } else {
                con.query(`SELECT * FROM archivedreports WHERE \`id\` = ${id}`, function(error, rows, fields) { 
                    if(rows[0]) {
                        resolve([rows[0].userid, rows[0].reason, rows[0].author, rows[0].date, rows[0].accepted])
                    } else {
                        resolve(undefined)
                    }
                })
            }
        })
    })
}

function deleteReport(id, accepted) {
    con.query(`SELECT * FROM reports WHERE id = ${id}`, function(error, rows, fields){
        if(rows[0]) {
            archiveReport(id, rows[0].userid, rows[0].reason, rows[0].author, rows[0].reportguild, rows[0].date, accepted)
        }        
    })
    con.query(`DELETE FROM reports WHERE id = ${id}`, function(error, rows, fields) {
        console.log("Successfully deleted row")
    })
}


function archiveReport(id, userid, reason, author, guild, date, accepted) {
    con.query(`INSERT INTO archivedreports (\`id\`, \`userid\`, \`reason\`, \`author\`, \`reportguild\`, \`date\`, \`accepted\`) VALUES ('${id}', '${userid}', '${escapeStr(reason)}', '${author}', '${guild}', '${date}', '${accepted}')`, function(error, rows, fields) {
        console.log("Successfully archived report in database");
    })
}

function checkAutoBan(guild) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM autoban WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            } else {
                if(rows[0]) {
                    resolve(false)
                } else {
                    resolve(true)
                }
            }
        })
    })
}

function setAutoBan(guild, bool) {
    if(bool === true) {
        con.query(`DELETE FROM autoban WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            }
        })
    } else if(bool === false) {
        con.query(`INSERT INTO autoban (\`guild\`) VALUES ('${guild}')`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            }
        })
    }
}

function checkAutoVerify(guild) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM autoverify WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            } else {
                if(rows[0]) {
                    resolve(true)
                } else {
                    resolve(false)
                }
            }
        })
    })
}

function checkAutoVerifyKick(guild) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM autoverify WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            } else {
                if(rows[0]) {
                    if(rows[0].kick === 1) {
                        resolve(true)
                    } else {
                        resolve(false)
                    }
                }
            }
        })
    })
}

function setAutoVerify(guild, bool, kick) {
    if(bool === false) {
        con.query(`DELETE FROM autoverify WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            }
        })
    } else if(bool === true) {
        if(kick === true) {
            con.query(`INSERT INTO autoverify (\`guild\`, \`kick\`) VALUES ('${guild}', 1)`, function(error, rows, fields) {
            })
        } else {
            con.query(`INSERT INTO autoverify (\`guild\`, \`kick\`) VALUES ('${guild}', 0)`, function(error, rows, fields) {
            })
        }
    } 
}

function checkAltIdentify(guild) {
    return new Promise(function(resolve, reject) {
        con.query(`SELECT * FROM alt WHERE guild = ${guild}`, function(error, rows, fields) {
            if(rows[0]) {
                resolve([true, rows[0].days])
            } else {
                resolve([false])
            }
        })
    })
}

function setAltIdentify(guild, days) {
    if(days) {
        con.query(`INSERT INTO alt (\`guild\`, \`days\`) VALUES ('${guild}', ${days})`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            }
        })
    } else {
        con.query(`DELETE FROM alt WHERE guild = ${guild}`, function(error, rows, fields) {
            if(!!error) {
                console.log(error)
            }
        })
    }
}

function addGuild(id) {
    con.query(`INSERT INTO guilds (\`id\`) VALUES (${id})`, function(error, rows, fields) {
        if(!!error) {
            console.log(error)
        }
    })
}

function removeGuild(id) {
    con.query(`DELETE FROM guilds WHERE id = ${id}`, function(error, rows, fields) {
        if(!!error) {
            console.log(error)
        }
    })
}

function getGuildLocal(guild) {
    con.query(`SELECT * FROM locals WHERE guild = '${guild.id}'`, async function(error,rows, fields) {
        if(!!error) {
            console.log(error)
        } else {
            if(rows[0]) {
                var lang = rows[0].lang
                locale[guild.id] = await getLocal(lang)
            } else {
                var lang = "en"
                locale[guild.id] = await getLocal(lang)
            }
        }
    })
}

function getLocal(lang) {
    var data = fs.readFileSync(`locales/${lang}.json`, 'utf8')
    return JSON.parse(data);
}



function generateUUID(length) {
    let uuid = '';
    for(i=0; i<19; ++i) uuid += Math.floor(Math.random() * length);
    return uuid;    
}

function capFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

function Getdate() {
    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = today.getFullYear();

    today = mm + '/' + dd + '/' + yyyy;
    return today;
}

function dhm(t){
    var cd = 24 * 60 * 60 * 1000,
        ch = 60 * 60 * 1000,
        d = Math.floor(t / cd),
        h = Math.floor( (t - d * cd) / ch),
        m = Math.round( (t - d * cd - h * ch) / 60000),
        pad = function(n){ return n < 10 ? '0' + n : n; };
  if( m === 60 ){
    h++;
    m = 0;
  }
  if( h === 24 ){
    d++;
    h = 0;
  }
  return d;
}

const escapeStr = str => 
  str.replace(/\\/g, "\\\\")
   .replace(/\$/g, "\\$")
   .replace(/'/g, "\\'")
   .replace(/"/g, "\\\"");



String.prototype.isNumber = function() {
    return /^\d+$/.test(this);
};

String.prototype.formatUnicorn = String.prototype.formatUnicorn ||
function () {
    "use strict";
    var str = this.toString();
    if (arguments.length) {
        var t = typeof arguments[0];
        var key;
        var args = ("string" === t || "number" === t) ?
            Array.prototype.slice.call(arguments)
            : arguments[0];

        for (key in args) {
            str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
        }
    }

    return str;
};

//errors
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

client.login("NzAyNTI0MDgwNDIyNjUwMDEw.XqBSiQ.eZMZJuAqqZm4l9JWqGJ3GoP4paA"); // old


