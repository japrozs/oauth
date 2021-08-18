import { User } from "../entities/User";
import { Ctx, Query, Resolver } from "type-graphql";
import { Context } from "vm";

@Resolver()
export class UserResolver {
    @Query(() => User, { nullable: true })
    me(@Ctx() { req }: Context) {
        if (!req.session.userId) {
            return null;
        }
        return User.findOne(req.session.userId);
    }
}
