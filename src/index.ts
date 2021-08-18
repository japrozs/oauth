import "reflect-metadata";
import "dotenv-safe/config";
import { __prod__, COOKIE_NAME } from "./constants";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "./resolvers/user";
import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";
import cors from "cors";
import { createConnection } from "typeorm";
import { User } from "./entities/User";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github";

const main = async () => {
    const conn = await createConnection({
        type: "postgres",
        database: "oauth",
        username: "postgres",
        password: "postgres",
        logging: true,
        synchronize: true,
        entities: [User],
    });
    await conn.runMigrations();
    const app = express();

    const RedisStore = connectRedis(session);
    const redis = new Redis();
    app.use(
        cors({
            origin: "http://localhost:3000",
            credentials: true,
        })
    );
    app.use(
        session({
            name: COOKIE_NAME,
            store: new RedisStore({
                client: redis,
                disableTouch: true,
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                httpOnly: true,
                sameSite: "lax", // csrf
                secure: __prod__, // cookie only works in https
            },
            saveUninitialized: false,
            secret: "qowiueojwojfalksdjoqiwueo",
            resave: false,
        })
    );

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [UserResolver],
            validate: false,
        }),
        context: ({ req, res }) => ({ req, res, redis }),
    });

    apolloServer.applyMiddleware({
        app,
        cors: false,
    });

    app.use(passport.initialize());
    passport.serializeUser((user: any, done) => {
        done(null, user.githubId);
    });

    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL: "http://localhost:4000/auth/github/callback",
            },
            async (_, __, profile, cb) => {
                let user = await User.findOne({
                    where: { githubId: profile.id },
                });
                if (user) {
                    // user is in the database, update the info
                    user.name = profile.displayName;
                    user.imgUrl = profile.photos
                        ? profile.photos[0].value
                        : "https://avatars.githubusercontent.com/u/57936?v=4";
                    user.email = profile?.emails && profile?.emails[0]?.value;

                    // you can also use User.update()
                    await user.save();
                } else {
                    user = await User.create({
                        name: profile.displayName,
                        imgUrl: profile.photos
                            ? profile.photos[0].value
                            : "https://avatars.githubusercontent.com/u/57936?v=4",
                        email: profile?.emails && profile?.emails[0]?.value,
                        githubId: profile.id,
                    });
                }
                cb(null, {
                    user,
                });
            }
        )
    );

    app.get(
        "/auth/github",
        passport.authenticate("github", {
            session: false,
        })
    );

    app.get("/auth/github/callback", (req, res) => {
        passport.authenticate(
            "github",
            {
                session: false,
            },
            async (err: Error, user) => {
                if (err) {
                    console.log(err.message);
                }
                const userDb = await User.findOne({
                    where: { githubId: req.session.userId },
                });
                req.session.userId = userDb?.id;
                res.json({ user: user.user });
            }
        )(req, res);
    });

    app.get("/", async (req, res) => {
        const user = await User.findOne(req.session.userId);
        if (user) {
            res.json({ user });
        } else {
            res.json({
                message: "you are not authenticated!",
            });
        }
    });

    app.listen(4000, () => {
        console.log(`🚀 Server started on http://localhost:4000`);
    });
};

main().catch((err) => {
    console.error(err);
});
