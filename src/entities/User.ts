import { Field, ObjectType } from "type-graphql";
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@ObjectType()
@Entity()
export class User extends BaseEntity {
    @Field()
    @PrimaryGeneratedColumn()
    id!: number;

    @Field()
    @Column("text", { nullable: true })
    name: string;

    @Field()
    @Column("text", { nullable: true })
    imgUrl: string;

    @Field(() => String, { nullable: true })
    @Column("text", { nullable: true })
    email: string | undefined;

    @Field()
    @Column("text", { unique: true })
    githubId: string;
}
